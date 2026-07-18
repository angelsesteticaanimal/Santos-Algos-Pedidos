# Santos Alhos — Usuários e permissões

## Perfis configurados

- Primeiro UID informado: **Administrador**
- Segundo UID informado: **Vendedor**

## Permissões

### Administrador
- Acesso total ao aplicativo
- Relatórios e configurações
- Cadastro e alteração de produtos
- Cancelamento e exclusão de pedidos
- Exclusão de clientes e produtos, quando permitido pelo aplicativo
- Importação e exportação de backup

### Vendedor
- Cadastro e edição de clientes
- Criação e edição de pedidos
- Atualização de entregas e status
- Consulta de produtos
- Sem relatórios financeiros e configurações
- Sem exclusões definitivas

## Publicação

1. Envie ao GitHub os arquivos do pacote e substitua os antigos.
2. No Firebase, abra **Firestore Database > Regras**.
3. Cole todo o conteúdo de `firestore.rules`.
4. Clique em **Publicar**.
5. Entre primeiro com a conta do administrador para remover dados antigos de usuários locais e concluir a migração.
6. Depois teste o acesso com a conta do vendedor.

## Auditoria

Novos pedidos, clientes e produtos passam a registrar UID, e-mail, nome, data de criação e última alteração.
