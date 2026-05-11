def validate_token(token: str) -> bool:
    return len(token) > 0

def login(username: str, password: str) -> dict:
    if validate_token(password):
        return {"status": "ok"}
    return {"status": "fail"}
