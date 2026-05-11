# poc-flue

POCs de sistemas agênticos com [Flue](https://flueframework.com).
Cada POC explora uma primitiva do design de agentes em domínio aplicado.

## POCs

| Nome | Descrição | Status |
|---|---|---|
| [auditor](./pocs/auditor/) | Agente que avalia outro agente e propõe ajustes via PR | em desenvolvimento |

## Estrutura

```
poc-flue/
├── pocs/                     # cada POC self-contained, com seu próprio Worker
│   └── <nome>/
│       ├── README.md
│       ├── wrangler.toml
│       ├── package.json
│       ├── .flue/
│       └── src/
├── docs/superpowers/         # specs e plans cross-POC
│   ├── specs/
│   └── plans/
└── .github/workflows/        # CI compartilhado (deploy roteado por POC)
```

## Conceitos compartilhados

Veja `docs/superpowers/specs/` pra leitura dos designs e `docs/superpowers/plans/` pra implementações executáveis.

## Como rodar uma POC

```bash
cd pocs/<nome>/
npm install
npm run dev
```

Cada POC tem seu próprio `README.md` com instruções específicas.
