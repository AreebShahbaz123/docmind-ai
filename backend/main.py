import uuid
from typing import Dict, List, Optional

from fastapi import FastAPI, File, HTTPException, Header, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

app = FastAPI(title='DocMind AI')

app.add_middleware(
    CORSMiddleware,
    allow_origins=['*'],
    allow_credentials=True,
    allow_methods=['*'],
    allow_headers=['*'],
)

users: Dict[str, Dict] = {}
user_tokens: Dict[str, str] = {}
user_documents: Dict[str, List[Dict]] = {}
user_index_summary: Dict[str, str] = {}

class RegisterPayload(BaseModel):
    name: str
    email: str
    password: str

class LoginPayload(BaseModel):
    email: str
    password: str

class QuestionPayload(BaseModel):
    question: str


def normalize_text(raw_text: str) -> str:
    return ' '.join(raw_text.replace('\r', ' ').split())


def extract_summary(text: str) -> str:
    sentences = [sentence.strip() for sentence in text.split('.') if sentence.strip()]
    if not sentences:
        return 'No document content available yet.'
    return sentences[0][:240] + ('...' if len(sentences[0]) > 240 else '')


def choose_answer(question: str, documents: List[Dict]) -> str:
    if not documents:
        return 'Upload a document first and then ask a question about the content.'

    question_terms = [term for term in question.lower().split() if len(term) > 3]
    best_match = None
    best_score = 0

    for document in documents:
        sentences = [sentence.strip() for sentence in document['content'].split('.') if sentence.strip()]
        for sentence in sentences:
            score = sum(1 for term in question_terms if term in sentence.lower())
            if score > best_score:
                best_score = score
                best_match = sentence

    if best_match and best_score > 0:
        return best_match + '.'

    return (
        'DocMind has reviewed your material and identified this highlight: '
        + extract_summary(documents[0]['content'])
    )


def parse_token(authorization: Optional[str]) -> str:
    if not authorization:
        raise HTTPException(status_code=401, detail='Missing authorization header.')
    prefix = 'Bearer '
    if not authorization.startswith(prefix):
        raise HTTPException(status_code=401, detail='Invalid authorization scheme.')
    token = authorization[len(prefix) :]
    user_email = user_tokens.get(token)
    if not user_email or user_email not in users:
        raise HTTPException(status_code=401, detail='Invalid or expired token.')
    return user_email


def get_user_documents(user_email: str) -> List[Dict]:
    return user_documents.setdefault(user_email, [])


def get_user_index(user_email: str) -> str:
    return user_index_summary.get(user_email, '')


@app.get('/')
def root():
    return {'message': 'Welcome to DocMind AI'}


@app.post('/api/register')
def register(payload: RegisterPayload):
    if payload.email in users:
        raise HTTPException(status_code=400, detail='Email already registered.')

    user = {
        'name': payload.name,
        'email': payload.email,
        'password': payload.password,
    }
    users[payload.email] = user
    token = str(uuid.uuid4())
    user_tokens[token] = payload.email
    return {'token': token, 'user': {'name': payload.name, 'email': payload.email}}


@app.post('/api/login')
def login(payload: LoginPayload):
    user = users.get(payload.email)
    if not user or user['password'] != payload.password:
        raise HTTPException(status_code=401, detail='Invalid email or password.')

    token = str(uuid.uuid4())
    user_tokens[token] = payload.email
    return {'token': token, 'user': {'name': user['name'], 'email': user['email']}}


@app.get('/api/documents')
def list_documents(authorization: Optional[str] = Header(None)):
    user_email = parse_token(authorization)
    return {
        'documents': [
            {'id': doc['id'], 'name': doc['name'], 'size': doc['size']}
            for doc in get_user_documents(user_email)
        ],
        'indexSummary': get_user_index(user_email),
    }


@app.post('/api/documents/upload')
async def upload_document(
    file: UploadFile = File(...),
    authorization: Optional[str] = Header(None),
):
    user_email = parse_token(authorization)
    name = file.filename
    if not name.lower().endswith(('.txt', '.md', '.json', '.csv')):
        raise HTTPException(
            status_code=400,
            detail='Unsupported file type. Upload a .txt, .md, .json, or .csv file.',
        )

    raw_data = await file.read()
    try:
        text = raw_data.decode('utf-8')
    except UnicodeDecodeError:
        text = raw_data.decode('latin-1', errors='ignore')

    content = normalize_text(text)
    documents = get_user_documents(user_email)
    document = {
        'id': len(documents) + 1,
        'name': name,
        'size': len(content),
        'content': content,
    }
    documents.insert(0, document)
    return {'document': {'id': document['id'], 'name': document['name'], 'size': document['size']}}


@app.post('/api/index')
def build_index(authorization: Optional[str] = Header(None)):
    user_email = parse_token(authorization)
    documents = get_user_documents(user_email)
    if not documents:
        raise HTTPException(status_code=400, detail='Upload at least one document before creating an index.')

    combined = ' '.join(document['content'] for document in documents)
    if not combined.strip():
        raise HTTPException(status_code=400, detail='Document content is empty.')

    summary = extract_summary(combined)
    user_index_summary[user_email] = summary
    return {'summary': summary}


@app.post('/api/question')
def ask_question(
    payload: QuestionPayload,
    authorization: Optional[str] = Header(None),
):
    user_email = parse_token(authorization)
    documents = get_user_documents(user_email)
    question = payload.question.strip()
    if not question:
        raise HTTPException(status_code=400, detail='Question required.')
    if not documents:
        raise HTTPException(status_code=400, detail='No documents uploaded.')

    answer = choose_answer(question, documents)
    return {'answer': answer}
