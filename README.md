# SafetyDate 🛡️

Plataforma de background check que ajuda mulheres a verificarem antecedentes criminais e processos judiciais de pessoas com quem pretendem se relacionar, usando dados públicos brasileiros e IA.

## Stack Tecnológica

- **Frontend:** Expo (React Native) — um só código vira app iOS, Android e Web
- **Backend:** Supabase (auth + banco + edge functions)
- **IA:** Claude API (Anthropic) — resumo inteligente de processos
- **Pagamento:** RevenueCat + Apple In-App Purchase + Google Play Billing
- **Fontes de dados:**
  - DataJud (CNJ) — processos judiciais
  - Diário Oficial da União — penalidades administrativas

## Modelo de Negócio

- **Consulta avulsa:** R$ 27 por busca (In-App Purchase)
- **Plano Anual:** R$ 97/ano com buscas ilimitadas (Subscription)

> ⚠️ Por ser um app vendido nas lojas, os pagamentos são **obrigatoriamente** feitos via In-App Purchase da Apple e Google. Essa é a regra oficial das lojas para conteúdo digital. O RevenueCat unifica as duas plataformas numa API só.

## Como rodar

Veja o [SETUP.md](./SETUP.md) para o passo-a-passo completo.

Rápido:
```bash
npm install
npx expo start
```

## Estrutura

```
SafetyDate/
├── app/              # Telas (Expo Router)
├── components/       # Componentes UI
├── lib/
│   ├── supabase.ts   # Cliente Supabase
│   ├── revenuecat.ts # Cliente RevenueCat (IAP)
│   └── theme.ts      # Design system
└── supabase/
    ├── migrations/   # Schema do banco
    └── functions/
        ├── background-check/   # Cadeia DataJud + DOU + Claude
        └── revenuecat-webhook/ # Sincroniza assinaturas
```
