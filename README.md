# Santos Pedidos Online — Versão 1

Aplicativo web responsivo para cadastro de clientes, produtos, pedidos e entregas de camarão e peixe.

## Acesso inicial

- Administrador: `admin` / `1234`
- Vendedor: `vendedor` / `1234`

## Abrir para testar

Abra `index.html` no navegador. Para testar todos os recursos de PWA, use um servidor local ou publique no GitHub Pages.

## Publicar no GitHub Pages

1. Crie um repositório novo no GitHub.
2. Envie todos os arquivos desta pasta para a raiz do repositório.
3. Abra **Settings > Pages**.
4. Em **Build and deployment**, selecione **Deploy from a branch**.
5. Escolha a branch `main` e a pasta `/ (root)`.
6. Salve e aguarde o link ficar disponível.

## Ativar banco online Firebase

1. Crie um projeto no Firebase.
2. Ative o Firestore Database.
3. Cadastre um aplicativo Web.
4. Copie a configuração fornecida pelo Firebase.
5. Abra `firebase-config.js` e substitua os campos `YOUR_...`.
6. Publique novamente os arquivos.

Enquanto a configuração não for inserida, o aplicativo usa o armazenamento local do navegador.

## Firestore — regras iniciais para teste

Durante os primeiros testes, use regras temporárias com prazo curto. Antes do uso real, implemente Firebase Authentication e regras por usuário.

```text
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /santosPedidos/{document=**} {
      allow read, write: if true;
    }
  }
}
```

**Atenção:** essas regras abertas servem somente para teste. Não use assim em produção.
