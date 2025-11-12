from fastapi.testclient import TestClient
from app.main import app
import traceback

client = TestClient(app)

try:
    resp = client.post('/api/users/login', data={'username':'debug_user@example.com','password':'debugpass123'})
    print('status_code:', resp.status_code)
    print('body:', resp.text)
except Exception as e:
    print('Exception raised by TestClient:')
    traceback.print_exc()
