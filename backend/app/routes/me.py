"""The signed-in user's own data: onboarding, profile, learned context, password, export,
delete."""
from typing import get_args

from fastapi import APIRouter, Depends, HTTPException, Request, Response

from app import accounts, personal
from app.engine.learn import NOT_TASTE
from app.intent import now_ist, parse
from app.models import Access, Tag
from app.routes.deps import clear_session_cookie, csrf, current_user, session_token
from app.schemas import (
    ContextImport,
    DeleteAccount,
    Diet,
    Mode,
    PasswordChange,
    Profile,
    ProfileContext,
    Question,
)

router = APIRouter(prefix="/me", tags=["me"], dependencies=[Depends(csrf)])


@router.get("/profile")
def get_profile(user: dict = Depends(current_user)) -> Profile:
    p = accounts.get_profile(user["id"])
    if p is None:  # not onboarded yet: a starting point, not saved
        return Profile(display_name=user["display_name"])
    return p


@router.put("/profile")
def put_profile(profile: Profile, user: dict = Depends(current_user)) -> Profile:
    accounts.put_profile(user["id"], profile)
    return profile


@router.put("/password", status_code=204)
def change_password(req: PasswordChange, request: Request,
                    user: dict = Depends(current_user)) -> None:
    if not accounts.verify_password(req.current_password, user["password_hash"]):
        raise HTTPException(403, "current password is wrong")
    accounts.update(user["id"], password_hash=accounts.hash_password(req.new_password))
    accounts.end_all_sessions(user["id"], keep=session_token(request))  # sign out other devices


@router.get("/export")
def export(user: dict = Depends(current_user)) -> dict:
    return accounts.export(user["id"])


@router.delete("", status_code=204)
def delete_me(req: DeleteAccount, response: Response, user: dict = Depends(current_user)) -> None:
    if not accounts.verify_password(req.password, user["password_hash"]):
        raise HTTPException(403, "password is wrong")
    if user["role"] == "admin" and accounts.admin_count() <= 1:
        raise HTTPException(409, "you're the last admin; make someone else admin first")
    accounts.delete(user["id"])
    clear_session_cookie(response)


# ---------------------------------------------------------------- onboarding (doc §13.1)
# Only the highest-value questions; every answer is optional and saved with PUT /me/profile.
TASTE = [t for t in get_args(Tag) if t not in NOT_TASTE]
QUESTIONS = [
    Question(id="interests", text="What do you enjoy most when you travel?", kind="multi",
             options=TASTE, max_choices=5, why="Ranks what matches your taste higher."),
    Question(id="dislikes", text="Anything you'd rather skip?", kind="multi", options=TASTE,
             max_choices=5, why="We won't suggest these unless you ask."),
    Question(id="age", text="How old are you?", kind="number",
             why="Sets a comfortable pace and age limits. Only you can see it."),
    Question(id="companions", text="Who do you usually travel with?", kind="companions",
             why="Plans for the whole group when you say you're with them."),
    Question(id="pace", text="How full do you like your days?", kind="single",
             options=["relaxed", "normal", "packed"], why="Adds breathing room between stops."),
    Question(id="budget_style", text="How do you usually spend?", kind="single",
             options=["budget", "mid", "premium"], why="A starting budget when you don't say one."),
    Question(id="transport", text="How do you like to get around?", kind="multi",
             options=list(get_args(Mode)), why="Travel times use your usual mode."),
    Question(id="accessibility", text="Do you need any of these?", kind="multi",
             options=list(get_args(Access)),
             why="Places that can't confirm them are left out. Only you can see it."),
    Question(id="needs_rest_breaks", text="Do you need rest breaks between stops?", kind="bool",
             why="Adds slack and avoids strenuous stops."),
    Question(id="avoid_crowds", text="Do crowds bother you?", kind="bool",
             why="Quieter places rank higher."),
    Question(id="hidden_gems", text="Prefer little-known local places over famous ones?",
             kind="bool", why="Community-run and less-touristy places rank higher."),
    Question(id="diet", text="Any food preference?", kind="single", options=list(get_args(Diet)),
             why="Food suggestions respect it."),
    Question(id="home_city", text="Which city do you live in?", kind="text",
             why="Where we plan when you don't say where you are."),
]


@router.get("/onboarding")
def onboarding(user: dict = Depends(current_user)) -> list[Question]:
    return QUESTIONS


# ---------------------------------------------------------------- learned context
# What the planner knows about your taste, from chats, feedback, past trips and itineraries you
# import. Visible, correctable, and never shown to admins or providers (doc §12.2).

def _context(user: dict) -> ProfileContext:
    from app.main import SEED  # lazy: main mounts this router
    return personal.context(user["id"], accounts.get_profile(user["id"]), SEED)


@router.get("/context")
def get_context(user: dict = Depends(current_user)) -> ProfileContext:
    return _context(user)


@router.post("/context/import")
def import_context(req: ContextImport, user: dict = Depends(current_user)) -> ProfileContext:
    """A past itinerary or trip notes in your own words ("Goa last winter: Old Goa churches,
    Fort Aguada, beach shacks; skipped the casinos") -> what you liked and avoided."""
    from app.main import SEED
    parsed, _ = parse(req.text, now_ist(), SEED)
    if not (parsed.intents or parsed.avoid):
        raise HTTPException(422, "couldn't find anything about what you liked in that text")
    accounts.bump_context(user["id"], personal.from_import(parsed.intents, parsed.avoid),
                          "import")
    return _context(user)


@router.delete("/context/{tag}", status_code=204)
def forget_tag(tag: Tag, user: dict = Depends(current_user)) -> None:
    accounts.forget_context(user["id"], tag)


@router.delete("/context", status_code=204)
def forget_all(user: dict = Depends(current_user)) -> None:
    accounts.forget_context(user["id"])
