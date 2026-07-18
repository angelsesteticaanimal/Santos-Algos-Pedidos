# Ativação do Firebase Authentication e Firestore

## 1. Publicar as regras do Firestore

No Firebase Console, abra **Firestore Database > Regras** e substitua todo o conteúdo pelo arquivo `firestore.rules`. Depois toque em **Publicar**.

As regras permitem acesso somente a usuários autenticados pelo Firebase.

## 2. Atualizar o GitHub

Envie os seguintes arquivos para a raiz do repositório e substitua os antigos:

- `index.html`
- `app.js`
- `styles.css`
- `firebase-config.js`
- `service-worker.js`

O arquivo `firestore.rules` não é executado pelo GitHub Pages; ele serve para copiar as regras no painel do Firebase.

## 3. Primeiro acesso

Abra o aplicativo publicado e entre usando o e-mail e a senha cadastrados em **Firebase Authentication > Usuários**.

No primeiro login, o aplicativo cria automaticamente o documento `santosPedidos/main` no Firestore. Se já houver dados online, eles serão carregados.
