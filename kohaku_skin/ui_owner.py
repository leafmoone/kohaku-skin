"""Package-wide UI owner for skin preferences and runtime state."""

import logging
from dataclasses import replace
from threading import RLock
from typing import Literal

from kohakuterrarium.api.ext import UICallContext
from kohakuterrarium.modules.ui_owner import (
    OwnerArgumentError,
    OwnerForbiddenError,
    UIOwnerMixin,
)

from .models import (
    DEFAULT_INTRO_PREFERENCES,
    ActiveSkinState,
    OwnerState,
    filename,
    nullable_skin_id,
    object_fields,
    parse_background,
    parse_intro_preferences,
    require_bool,
    require_choice,
    require_fields,
    require_skin_id,
)
from .storage import (
    CUSTOM_INTROS_HINT,
    CUSTOM_SKINS_HINT,
    SkinPack,
    StorageScope,
    decode_upload,
    delete_intro,
    delete_skin,
    find_intro,
    find_skin,
    install_skin,
    list_intros,
    list_skins,
    load_active_payload,
    load_preferences,
    remove_wallpaper,
    save_preferences,
    storage_scope,
    upload_wallpaper,
)

_LOG = logging.getLogger(__name__)
_SKIN_UPLOAD_FORMATS: tuple[Literal["zip", "css"], ...] = ("zip", "css")
STATE_LOCK = RLock()


def _active_state(pack: SkinPack | None) -> ActiveSkinState | None:
    if pack is None:
        return None
    try:
        return load_active_payload(pack).to_state()
    except (OwnerArgumentError, OSError) as exc:
        _LOG.warning("Could not load active skin %s: %s", pack.manifest.id, exc)
        return None


def _scope(context: UICallContext | None) -> StorageScope:
    if context is None:
        return storage_scope(False, None, False)
    return storage_scope(context.multi_user, context.user_id, context.is_admin)


class PackageUI(UIOwnerMixin):
    """Synchronize owner actions and publish updates to the calling user."""

    def __init__(self) -> None:
        self._lock = STATE_LOCK

    def ui_state(self, context: UICallContext | None = None) -> OwnerState:
        with self._lock:
            scope = _scope(context)
            preferences = load_preferences(scope)
            skins = list_skins(scope)
            intros = list_intros(scope)
            intro_id = preferences.intro.active_intro_id
            intro = intros.get(intro_id) if preferences.intro.enabled and intro_id is not None else None
            active = None
            if preferences.skin_enabled and preferences.active_skin_id is not None:
                active = skins.get(preferences.active_skin_id)
            return {
                "preferences": preferences.to_state(),
                "skins": [pack.manifest.to_state() for pack in skins.values()],
                "active_skin_payload": _active_state(active),
                "custom_skins_rel_hint": CUSTOM_SKINS_HINT,
                'intros': [pack.manifest.to_state() for pack in intros.values()],
                'active_intro_payload': intro.manifest.to_state() if intro is not None else None,
                'custom_intros_rel_hint': CUSTOM_INTROS_HINT,
            }

    def ui_call(
        self, action: str, args: dict[str, object], context: UICallContext | None = None
    ) -> OwnerState:
        with self._lock:
            scope = _scope(context)
            if scope.user_dir is None:
                raise OwnerForbiddenError("Sign in to change skin preferences")
            self._apply_action(scope, action, object_fields(args, "args"))
            state = self.ui_state(context)
            user_id = context.user_id if context is not None and context.multi_user else None
            self.ui_emit("state", state, user_id=user_id)
            return state

    def _apply_action(self, scope: StorageScope, action: str, args: dict[str, object]) -> None:
        preferences = load_preferences(scope)
        background = preferences.background
        if action == "set_skin":
            require_fields(args, ("skin_enabled", "active_skin_id"))
            enabled = require_bool(args.get("skin_enabled"), "skin_enabled")
            if "active_skin_id" not in args:
                raise OwnerArgumentError("active_skin_id must be a skin id or null")
            skin_id = nullable_skin_id(args["active_skin_id"], "active_skin_id")
            if enabled and skin_id is not None:
                pack = find_skin(scope, skin_id)
                if pack is None:
                    raise OwnerArgumentError(f"Unknown skin: {skin_id!r}")
                load_active_payload(pack)
            save_preferences(scope, replace(preferences, skin_enabled=enabled, active_skin_id=skin_id))
        elif action == "set_background":
            save_preferences(scope, replace(preferences, background=parse_background(args, background, False)))
        elif action == "rescan_skins":
            require_fields(args, ())
        elif action == "install_custom_skin":
            require_fields(args, ("format", "filename", "content_base64", "activate"))
            upload_format: Literal["zip", "css"] = require_choice(args.get("format"), _SKIN_UPLOAD_FORMATS, "format")
            upload_name = filename(args.get("filename"), "filename")
            activate = require_bool(args.get("activate"), "activate")
            pack = install_skin(scope, upload_format, upload_name, decode_upload(args.get("content_base64")))
            if activate:
                save_preferences(scope, replace(preferences, skin_enabled=True, active_skin_id=pack.manifest.id))
        elif action == "delete_custom_skin":
            require_fields(args, ("skin_id",))
            skin_id = require_skin_id(args.get("skin_id"), "skin_id")
            delete_skin(scope, skin_id)
            if preferences.active_skin_id == skin_id:
                save_preferences(scope, replace(preferences, skin_enabled=False, active_skin_id=None))
        elif action == "upload_wallpaper":
            require_fields(args, ("filename", "content_base64"))
            upload_name = filename(args.get("filename"), "filename")
            saved_name = upload_wallpaper(scope, upload_name, decode_upload(args.get("content_base64")))
            try:
                updated = replace(background, mode="custom", uploaded_file=saved_name)
                save_preferences(scope, replace(preferences, background=updated))
            except OSError:
                remove_wallpaper(scope, saved_name)
                raise
            remove_wallpaper(scope, background.uploaded_file)
        elif action == "clear_wallpaper":
            require_fields(args, ())
            updated = replace(
                background,
                mode="skin" if background.mode == "custom" else background.mode,
                uploaded_file="",
                custom_url="",
            )
            save_preferences(scope, replace(preferences, background=updated))
            remove_wallpaper(scope, background.uploaded_file)
        elif action == "set_intro":
            intro = parse_intro_preferences(args, preferences.intro)
            if intro.enabled and intro.active_intro_id is not None and find_intro(scope, intro.active_intro_id) is None:
                raise OwnerArgumentError(f"Unknown intro: {intro.active_intro_id!r}")
            save_preferences(scope, replace(preferences, intro=intro))
        elif action == "rescan_intros":
            require_fields(args, ())
        elif action == "delete_custom_intro":
            require_fields(args, ("intro_id",))
            intro_id = require_skin_id(args.get("intro_id"), "intro_id")
            delete_intro(scope, intro_id)
            if preferences.intro.active_intro_id == intro_id:
                intro = replace(
                    preferences.intro, enabled=False, active_intro_id=DEFAULT_INTRO_PREFERENCES.active_intro_id
                )
                save_preferences(scope, replace(preferences, intro=intro))
        else:
            raise OwnerArgumentError(f"Unknown action: {action!r}")

    def close(self) -> None:
        """The owner holds no open resources."""
