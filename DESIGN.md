# Undercooked - Game Design Doc

> Uma paródia cozy de Overcooked. Sem pressa, sem timer, sem derrota.
> Status: ideação (2026-10-10). Nada implementado ainda.

## 1. Visão

**Pitch:** você é um chef numa cabana à beira de um lago na floresta. Bichos da fauna brasileira chegam da névoa pedindo comida brasileira. Ninguém tem pressa. Se o pastel sair cru, a capivara acha "rústico, adorei".

**Sensação-alvo:** o loop gostoso do Overcooked (pegar, cortar, cozinhar, entregar) sem a ansiedade. A graça vem do feedback (som, partícula, squash) e dos clientes, não da pressão.

**Tom:** cozy com humor leve. Cada mecânica estressante do Overcooked tem uma versão invertida:

| Overcooked | Undercooked |
|---|---|
| Timer da fase | O sol se põe devagar; quando escurece, o dia acaba |
| Pedido expira | O cliente espera para sempre ("tô lendo meu livro") |
| Comida queima, fogo | Comida sai "cozycooked" e o cliente acha graça |
| Fumaça preta | Vapor em formato de coração |
| Estrelas/pontuação | Moedas que caem no chão, como no Kingdom |

**Objetivo do projeto:** portfólio/diversão. Hospedado no GitHub Pages em `games/cozycooked/`.

## 2. Gameplay

### Controles
- Chef top-down com movimento livre (WASD/setas).
- **Um botão de interagir** (E/Espaço) na estação à frente. Sem minigames de precisão.
- Desktop primeiro; mobile (joystick virtual + botão) depois.

### Regra do botão único
- Mãos vazias + estação com item → pega.
- Mãos cheias + estação vazia → coloca.
- Os dois cheios → tenta combinar (ex.: recheio no pastel, prato no balcão).
- Estações de processo (tábua, panela, fritadeira) avançam com apertos ou sozinhas com o tempo, e **nunca queimam**.

### Estações (v1)
Caixa de ingrediente, bancada, tábua de corte, panela, fritadeira, pilha de pratos, janela de entrega, lixeira.

### Falha
Erros fofos, sem punição. Prato cru ou estranho é entregue mesmo assim e gera uma reação engraçada. Pode render menos moedas, nunca zero.

### Receitas (v1) - progressão de complexidade
| # | Prato | Ensina | Passos |
|---|---|---|---|
| 1 | Brigadeiro (tutorial) | Panela + entregar | leite condensado + chocolate → panela → prato |
| 2 | Pastel | Cortar + combinar + fritar | massa + queijo/carne (cortado) → montar → fritadeira → prato |
| 3 | Baião de dois | Vários ingredientes na mesma panela | arroz + feijão + queijo coalho (cortado) → panela → prato |

### Clientes
Fauna brasileira num lago de floresta estilo Kingdom (névoa, pinheiros). A capivara saindo da névoa nórdica é parte da piada.
- Capivara (calma, gosta de tudo)
- Bicho-preguiça (o cliente mais paciente do mundo; leva 1 minuto para sentar)
- Tucano, sapo-cururu, lobo-guará (tímido; só aparece no fim de tarde)
- Alguns aldeões humanos raros (pescador, lenhadora)

### Economia: moedas
- O cliente satisfeito joga moedas que caem tilintando no chão, e o chef recolhe (aceno ao Kingdom).
- As moedas compram ingredientes especiais e receitas numa vendinha.
- **Rede de segurança:** os ingredientes básicos são sempre grátis. É impossível ficar travado sem dinheiro.

### Estrutura do dia
1. Amanhecer: a cabana abre, a névoa sobe do lago.
2. Manhã/tarde: os clientes chegam no ritmo deles (fila sem timer).
3. Pôr do sol: o céu e o lago ficam laranja; os últimos clientes.
4. Noite: o chef acende as lamparinas, senta no deck e aparece um **diário do dia** (quem veio, o que comeram, moedas e uma frase fofa).

### Progressão
- Novas receitas, compradas ou ganhas.
- Dias e estações do ano mudando a paleta, o clima e os ingredientes disponíveis (pós-v1).

## 3. Visual

- **Câmera:** top-down 3/4 (estilo Stardew).
- **Inspiração:** Kingdom Two Crowns, pela paleta restrita, pelo céu e luz fazendo o trabalho emocional e pelas lamparinas quentes à noite.
- **Resolução interna:** 480x270, tiles de 16x16, escala inteira (4x = 1080p).
- **Paletas (Lospec):**
  - [Vinik24](https://lospec.com/palette-list/vinik24) como base
  - [SLSO8](https://lospec.com/palette-list/slso8) para o pôr do sol e as lamparinas
  - [Nyx8](https://lospec.com/palette-list/nyx8) para a noite
- **O "Kingdom" vem da pós-produção:**
  - Dia/noite: tween da `ambientColor` do sistema de luzes do Phaser (branco → laranja → azul-escuro).
  - Lamparinas, fogão e fritadeira com luzes pontuais e flicker; halos com `PointLight`.
  - Lago: tiles animados + nuvens refletidas (TileSprite mascarado na água, tingido pela hora do dia) + reflexo curto do chef e dos clientes na beirada do deck.
  - ColorMatrix/Gradient num `Layer` do mundo (sem afetar a UI).
- **Comida crua e cozida:** variantes feitas por nós com deslocamento de rampa de cor. Crua mais rosada, no ponto mais dourada, "cozycooked" com cara engraçada.

## 4. Áudio
- Música lo-fi CC0 ([Holizna](https://opengameart.org/content/happy-lo-fi-lofi-collection)).
- Sons de cozinha estilo ASMR: corte, chiado, borbulhar, pratos, tilintar de moedas.
- Tela de título "clique para começar" para destravar o WebAudio.
- Formatos OGG + M4A.

## 5. Assets (só licenças que permitem repo público)

O repo é público, então commitar os PNGs é redistribuir. **Proibidos:** LimeZu Modern Interiors, Sprout Lands, Cozy People/Farm, Reakain Kitchen, ssugmi Kitchenware.

| Papel | Pack | Licença |
|---|---|---|
| Natureza, água, personagens | [Ninja Adventure](https://pixel-boy.itch.io/ninja-adventure-asset-pack) | CC0 |
| Interior da cozinha | [Kenney Roguelike Indoors](https://kenney.nl/assets/roguelike-indoors) e/ou [LimeZu Kitchen and more](https://limezu.itch.io/kitchen) | CC0 / CC BY 4.0 |
| Comida | [Free Pixel Food](https://henrysoftware.itch.io/pixel-food) | CC0 |
| SFX | [TinyWorlds boiling](https://opengameart.org/node/12411), [chopping](https://opengameart.org/node/12413), Freesound CC0, [Kenney Impact](https://kenney.nl/assets/impact-sounds) | CC0 |

**A desenhar por nós:** brigadeiro, pastel, baião de dois e ingredientes (~10-15 ícones 16x16); chapéu de chef; os bichos brasileiros (provavelmente o maior trabalho de arte).

**Para checar depois de baixar:** se o Kenney tem fogão/forno; a lista de comidas do Ninja Adventure.

## 6. Técnica

- **Phaser 4.2.1**, build UMD via cdnjs com SRI (o build ESM ainda tem bugs de namespace). O nosso código é ES modules sem bundler.
- Config: `pixelArt: true`, `Scale.NONE` + `MAX_ZOOM`, recalculando o zoom no resize. **Sem zoom de câmera** (bug #7351).
- Mapas no **Tiled** (.tmj, tileset embutido, camadas CSV). Estações numa object layer. Nada de TilemapGPULayer (#7317, #7331).
- Arquitetura de cozinha inspirada em [overcooked_ai](https://github.com/HumanCompatibleAI/overcooked_ai) e Kitchen Chaos:
  - Estações num `Map` por tile, cada uma com `held` e `interact(player)`.
  - Itens são dados (`{kind, state, contents}`).
  - Receitas em JSON.
- i18n: `i18n/en.json` + `i18n/pt-BR.json` via fetch, com `t(key, vars)` e fallback para EN. A fonte bitmap precisa ter os acentos de PT-BR.
- Save: `localStorage['cozycooked.save.v1']` versionado, com `migrate()` e try/catch. Botão de exportar/importar save (o Safari pode apagar o storage).
- GitHub Pages/Jekyll:
  - Nenhum arquivo ou pasta começando com `_`.
  - Sem front matter.
  - **Nada de `.nojekyll`.**
  - Cache de 10 min, então versionar os módulos (`?v=N` ou pasta versionada).
- Teste local: `python3 -m http.server` (módulos ES não rodam em `file://`).

### Estrutura de pastas
```
games/cozycooked/
  index.html  style.css
  src/
    main.js  config.js
    scenes/   Boot Preload Title Kitchen Ui
    systems/  DayNight Lighting Water Input Save I18n Audio
    world/    Player Station stations/* Item Recipes Orders Customers
  data/       recipes.json  customers.json  palette.json
  i18n/       en.json  pt-BR.json
  assets/     maps/ tiles/ sprites/ fx/ audio/ fonts/
```

## 7. Escopo v1 (fatia vertical)

- 1 cozinha no deck do lago
- 3 receitas (brigadeiro, pastel, baião)
- 3-4 tipos de cliente
- 1 dia completo (~5 min), do amanhecer até o diário da noite
- Moedas no chão, sem vendinha ainda
- Dia/noite com luzes, reflexo no lago, áudio
- EN + PT-BR, save básico

**Fora da v1:** vendinha, estações do ano, co-op local, mobile, decoração.

## 8. Marcos sugeridos

1. **Protótipo cinza:** quadrados coloridos, movimento, estações e regra do botão único com o brigadeiro. *O loop é gostoso?*
2. **Loop completo:** 3 receitas, clientes, fila e moedas.
3. **Arte:** tiles, paleta, chef e clientes.
4. **Atmosfera:** ciclo dia/noite, luzes, lago e áudio.
5. **Polimento:** juice, i18n, save, título, diário.

## 9. Riscos

1. Phaser 4 é novo: os exemplos da comunidade são de v3 e há bugs abertos. A versão fica fixada em 4.2.1.
2. "Cozy, mas raso" (a crítica que o Cozy Cooking: Tiny Tastes recebe). Mitigação: capricho no feedback e clientes com personalidade.
3. Arte dos bichos brasileiros: não existe em pack e é o maior custo de arte.
4. Coesão visual ao misturar packs: normalizar para 16px e para a paleta offline.
5. Nome: já existem vários "Undercooked" no itch.io, e Overcooked é marca da Team17. Ok como paródia pessoal; repensar se for publicar.

## 10. Perguntas em aberto

- A personalidade do chef: tem nome? Que fala ele tem?
- Algum cliente com uma pequena história ao longo dos dias?
- O jogo tem uma tela de título temática (o chef cochilando no deck)?
- O que exatamente faz a comida sair "cozycooked"? Pular uma etapa, ou entregar antes de terminar?
