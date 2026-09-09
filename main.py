import os
from flask import Flask, render_template

app = Flask(__name__)

@app.get('/')
def index():
    return render_template('index.html')

@app.get('/healthz')
def health():
    return {'status': 'ok'}

@app.after_request
def headers(response):
    response.headers['X-Content-Type-Options'] = 'nosniff'
    response.headers['Referrer-Policy'] = 'no-referrer'
    response.headers['X-Frame-Options'] = 'DENY'
    return response

application = app
if __name__ == '__main__':
    app.run(host='127.0.0.1', port=int(os.environ.get('PORT', '5050')), debug=False)
