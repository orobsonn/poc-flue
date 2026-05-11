# Notas do vault embutidas no POC

POC valida ou exercita 14 notas da Metodologia de Agentes LLM (sessão 08/05/2026 do vault).

| Nota | Papel no POC |
|---|---|
| `wo376zfdqhr0` Arquitetura de Estado 3 Camadas | Implícito (POC simples — 1 macro/modo/fase) |
| `rz7bekzmqm82` Memória 3 Níveis | N1 Session.history, N2 sandbox, N3 R2+FAW |
| `f11ogz64i2q3` Roteamento Implícito | Não usado (POC sem fases conversacionais) |
| `37g4pvtcm7r2` Capability Registry | Não usado (1 fase, sem tools dinâmicas) |
| `jugb68g4o8q4` Decision Log 4 Camadas | **Aplicado literal** — schema, defesa PII, cron auditor, PR humano |
| `0tps2bt60pab` Folder-as-Workspace | R2 monitor + repo de artefatos |
| `vef583g2wdx9` KB Markdown pra LLM | Convenção R2 (atomicidade, hierarquia rasa) |
| `wdg0dh9ljzyd` Anatomia de Skill | Skills como pastas, frontmatter, references |
| `wdit02rgh0z8` Description Pushy | Aplicado em todas as 5 skills |
| `s8xg0k5bgy30` Composição Multi-Agente | Modo isolated (1 agente disparado por loop) |
| `412ehi8jxu5q` Modelo Mental Real | Documentado em `docs/ARCHITECTURE.md` |
| `zxcr9hupg1p1` 5 Bordas de Estado Órfão | Mitigações em try/finally e abort race |
| `z6eq6wsko79x` Familiaridade vs Compreensão | Validamos doc real do Flue antes de assumir |
| `k3vjj4ue4pud` Limites do Flue | POC tapa eval/replay |
| `8w6an1fp6rqp` Espaço Cartesiano antes de Atacar | Bucketing aplicado direto |

Cada nota acima tem ID no vault `mind-vault`; uso desta tabela é guia de leitura quando o leitor quer entender qual conceito do vault o POC materializa em código.
