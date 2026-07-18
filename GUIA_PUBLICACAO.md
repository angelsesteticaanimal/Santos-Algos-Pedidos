# Publicação no GitHub Pages

## Parte 1 — colocar o aplicativo no ar

1. Entre em https://github.com e faça login.
2. Toque no sinal **+** e escolha **New repository**.
3. Nome sugerido: `santos-pedidos-online`.
4. Marque o repositório como **Public**.
5. Não marque README, .gitignore ou licença.
6. Toque em **Create repository**.
7. Na tela do repositório, escolha **uploading an existing file**.
8. Extraia este ZIP e envie todos os arquivos e a pasta `assets` para a raiz do repositório.
9. Confirme em **Commit changes**.
10. Abra **Settings > Pages**.
11. Em **Source**, selecione **Deploy from a branch**.
12. Escolha `main`, pasta `/ (root)` e salve.
13. O endereço terá o formato:
   `https://SEU-USUARIO.github.io/santos-pedidos-online/`

## Parte 2 — Firebase

Somente depois de confirmar que o aplicativo abriu pelo link:

1. Crie um projeto no Firebase.
2. Ative o Firestore Database.
3. Registre um aplicativo Web.
4. Copie a configuração para `firebase-config.js`.
5. Publique o arquivo novamente no GitHub.
6. Cole o conteúdo de `firestore.rules` na aba Rules do Firestore e publique.

A regra incluída é temporária para teste. Antes de cadastrar clientes reais, deve ser ativado o Firebase Authentication e regras restritas.
