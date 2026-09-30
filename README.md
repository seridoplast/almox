# SERIDOPLAST — Almoxarifado Interno V6.7

Sistema web de controle de almoxarifado do CD Cruzeta, com autenticação, materiais, movimentações, estoque, indicadores e gerenciamento de usuários.

## Estrutura do projeto

```text
SERIDOPLAST_ALMOX_V6_7_ORGANIZADO_CORRIGIDO/
├── index.html
├── README.md
├── css/
│   └── style.css
├── js/
│   └── app.js
└── assets/
    └── images/
        └── imagem_embutida_1.jpg
```

### `index.html`
Contém a estrutura da interface:
- tela de login e primeiro acesso;
- menu lateral;
- dashboard;
- telas de materiais e movimentações;
- formulários;
- tabelas;
- modais;
- gerenciamento de usuários;
- ícones SVG utilizados pela interface.

Ele carrega o cliente oficial do Supabase pelo CDN e, em seguida, `js/app.js`.

### `css/style.css`
Responsável pelo visual:
- identidade vermelha/amarela da Seridoplast;
- sidebar;
- topbar;
- cards/KPIs;
- tabelas;
- formulários;
- modais;
- login;
- responsividade para telas menores.

### `js/app.js`
Contém a lógica do sistema:
- conexão com Supabase;
- autenticação;
- sessão do usuário;
- permissões ADMIN/OPERADOR;
- carregamento dos dados;
- materiais;
- movimentações;
- cálculo de saldo;
- dashboard;
- usuários;
- sincronização/realtime;
- atualização da interface.

### `assets/images/`
Contém imagens que originalmente estavam incorporadas no HTML em Base64.

---

## Como o sistema funciona

A aplicação roda no navegador e usa o Supabase como backend.

```text
Navegador
   |
   +-- index.html
   +-- css/style.css
   +-- js/app.js
   |
   +------ Internet ------> Supabase
                              |
                              +-- autenticação
                              +-- PostgreSQL
                              +-- materiais
                              +-- movimentações
                              +-- perfis/usuários
```

Não existe um servidor Flask/Node/PHP neste projeto. O JavaScript conversa com o Supabase usando o cliente `@supabase/supabase-js`.

## Login

Ao abrir o sistema, o `<body>` começa com a classe `locked`. Isso mantém a aplicação escondida enquanto a sessão é verificada.

O JavaScript consulta o Supabase:
1. se existe uma sessão válida, carrega o usuário e libera o sistema;
2. se não existe sessão, exibe o formulário de login;
3. no primeiro acesso, o sistema pode apresentar a criação do administrador, conforme a configuração existente no projeto.

## Perfis

O sistema trabalha com perfis como:

- `ADMIN`: acesso administrativo, incluindo gerenciamento de usuários;
- `OPERADOR`: acesso operacional conforme as permissões configuradas.

A interface esconder um botão não deve ser considerada proteção suficiente. As permissões reais também devem existir no Supabase por meio de RLS (Row Level Security) e das políticas das tabelas.

## Materiais

Os materiais possuem informações como código, descrição, categoria, unidade, localização, estoque mínimo e observações.

O cadastro/edição é enviado ao Supabase. Depois da operação, o sistema recarrega os dados e atualiza a interface.

## Movimentações

O estoque é calculado a partir das movimentações. Tipos presentes na lógica incluem entrada, saída, devolução e ajustes.

De forma simplificada:

```text
saldo = entradas + devoluções - saídas + ajustes
```

O sistema usa as movimentações registradas para atualizar estoque e indicadores.

## Dashboard

A dashboard utiliza os dados carregados para apresentar informações como:
- materiais cadastrados;
- situação do estoque;
- movimentações;
- alertas;
- indicadores e rankings;
- atalhos para operações frequentes.

## Supabase

A URL do projeto e a chave pública/publishable ficam no JavaScript. Isso é normal para aplicações frontend com Supabase.

A segurança não deve depender de esconder a chave pública. Ela deve depender de:
- autenticação;
- RLS habilitado;
- políticas corretas nas tabelas;
- funções administrativas protegidas;
- nenhuma `service_role` key exposta no frontend.

## Executando localmente

Como o projeto usa caminhos relativos, é recomendado servi-lo por HTTP em vez de abrir `index.html` diretamente.

Com Python:

```bash
python -m http.server 8000
```

Depois abra:

```text
http://localhost:8000
```

É necessário acesso à internet para carregar o cliente do Supabase pelo CDN e acessar o projeto Supabase.

## Publicação

Por ser frontend estático, o projeto pode ser hospedado em serviços de páginas estáticas, desde que o projeto Supabase continue configurado corretamente.

Antes de produção, revise:
1. RLS de todas as tabelas;
2. políticas de ADMIN e OPERADOR;
3. URLs permitidas no Supabase Auth;
4. funções administrativas;
5. exposição de qualquer chave sensível;
6. backups e regras do banco.

## Correção desta versão

A versão organizada anterior teve o JavaScript alterado indevidamente durante a formatação automática, quebrando trechos de strings e impedindo a inicialização correta da autenticação.

Nesta versão, `js/app.js` foi restaurado diretamente do HTML original. A separação HTML/CSS/JS foi mantida, mas a lógica JavaScript original foi preservada para que a tela de login volte a inicializar corretamente.
