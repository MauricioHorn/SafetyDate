# 📋 SPEC: Refatoração Completa do SOS — App ELAS

## 🎯 Objetivo
Refatorar TODA a funcionalidade de SOS do app ELAS com as novas decisões de produto.

## 📐 Arquitetura do novo SOS

### Mecanismo de ativação
```
1 toque no botão SOS → Tela vermelha fullscreen com countdown de 10s
→ Se NÃO cancelar em 10s → dispara tudo automaticamente
→ Se cancelar → aborta, volta à home
```

### Canais de alerta (disparados EM PARALELO quando o countdown termina)
1. **Push notification** pras 5 amigas cadastradas (automático, sem confirmação)
2. **WhatsApp** pro contato prioritário (abre app com mensagem pré-pronta, 1 toque da usuária pra enviar)
3. **SMS backup** automático se celular sem internet
4. **Registra alerta** no Supabase com GPS, bateria, timestamp

### Tela pós-SOS (aparece automaticamente após disparar)
- 🟢 **"Foi engano"** → avisa todas as amigas que foi falso alarme (push verde + WhatsApp tranquilizador)
- 🟠 **"Ainda preciso de ajuda"** → mantém alerta ativo

**NÃO incluir botão de ligar 190** (pode causar mais pânico).

## 🗂️ Arquivos a modificar/criar

### 1. Migration SQL (nova)
**Arquivo:** `supabase/migrations/YYYYMMDDHHMMSS_sos_refactor.sql`

```sql
-- Adiciona campos novos na tabela sos_alerts
ALTER TABLE sos_alerts ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active';
ALTER TABLE sos_alerts ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ;
ALTER TABLE sos_alerts ADD COLUMN IF NOT EXISTS resolution_note TEXT;
ALTER TABLE sos_alerts ADD COLUMN IF NOT EXISTS whatsapp_contact_id UUID REFERENCES emergency_contacts(id);

-- Valores possíveis de status: 'active', 'false_alarm', 'resolved'

-- Tabela de tokens de push (pra cada amiga receber alertas)
CREATE TABLE IF NOT EXISTS push_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  expo_push_token TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS
ALTER TABLE push_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own push tokens" ON push_tokens
  FOR ALL USING (auth.uid() = user_id);
```

### 2. `components/SosButton.tsx` (REESCREVER completo)
Botão fixo no rodapé da home. Ao tocar 1 vez (não segurar), navega pra `/sos-countdown`.

```tsx
// Visual:
// - Circular ou retangular grande (64px altura mínima)
// - Cor: vermelho (#DC2626)
// - Ícone SOS ou 🚨
// - Texto: "SOS" ou "EMERGÊNCIA"
// - Feedback tátil leve no toque (Haptics.impactAsync)
// - onPress: router.push('/sos-countdown')
```

### 3. `app/sos-countdown.tsx` (CRIAR — tela nova)
Tela fullscreen vermelha com countdown de 10 segundos.

```tsx
// Especificações:
// - Background sólido #DC2626 (vermelho)
// - Emoji 🚨 grande no topo
// - Título: "ALERTA SERÁ ENVIADO"
// - Subtítulo: "Cancele se foi engano"
// - Número de countdown gigante (fonte 120px+): 10 → 9 → 8 → ... → 0
// - Barra de progresso branca (animada) que diminui a cada segundo
// - Texto: "segundos restantes"
// - Botão "CANCELAR" grande embaixo (fácil de acertar)
//   - Background branco, texto vermelho
//   - Padding generoso (18-22px)
//   - Border radius 16-18px
// - Vibração (Haptics) a cada segundo
// - Se countdown zerar → navega pra /sos-aftermath e dispara triggerSOS()
// - Se clicar Cancelar → router.back() e cancela tudo

// Dependências:
// - expo-router
// - expo-haptics
```

### 4. `app/sos-aftermath.tsx` (CRIAR — tela nova)
Tela que aparece após disparar o SOS.

```tsx
// Especificações:
// - Background dark (#0A0A14)
// - Card verde (#10B981) no topo: "✓ ALERTA ENVIADO" + "X amigas notificadas"
// - Título: "Você está segura?"
// - Subtítulo: "Avise suas amigas pra elas ficarem tranquilas"
// 
// 2 botões GRANDES (um embaixo do outro, com padding 22px):
// 
// BOTÃO 1: "Foi engano" (verde #10B981)
//   - Sub-texto: "Avisar todas que estou bem"
//   - onPress: chama markAsFalseAlarm() → navega pra home
// 
// BOTÃO 2: "Ainda preciso de ajuda" (transparente com borda coral #FF4D7E)
//   - Sub-texto: "Manter alerta ativo"
//   - onPress: mantém alerta ativo, pode voltar pra home OU oferecer Modo Seguro

// NÃO incluir botão "Ligar 190"
```

### 5. `lib/safety.ts` (ADICIONAR funções)

```tsx
// Função principal: dispara todos os canais em paralelo
export async function triggerSOS(): Promise<string> {
  // 1. Pega localização (GPS high accuracy)
  // 2. Pega bateria (expo-battery)
  // 3. Verifica internet (@react-native-community/netinfo)
  // 4. Busca emergency_contacts do usuário (os 5)
  // 5. Busca contato marcado como prioritário (pra WhatsApp)
  // 
  // Cria registro em sos_alerts com status='active'
  // 
  // Em paralelo:
  // - Chama edge function 'send-sos-push' (push pras 5)
  // - Se tem internet: abre WhatsApp do prioritário
  // - Se SEM internet: abre SMS pras 5 com mensagem formatada
  // 
  // Retorna o alert_id criado
}

export async function markAsFalseAlarm(alertId: string): Promise<void> {
  // 1. Atualiza sos_alerts: status='false_alarm', resolved_at=NOW()
  // 2. Chama edge function 'send-sos-cancel' (push verde pras amigas)
  // 3. Abre WhatsApp do prioritário com mensagem tranquilizadora (opcional)
}

export async function keepAlertActive(alertId: string): Promise<void> {
  // Mantém status='active'
  // Pode ativar Modo Seguro automaticamente
}

export async function sendSMSFallback(contacts: EmergencyContact[], location: LocationData): Promise<void> {
  // Abre app de SMS com múltiplos destinatários
  // Mensagem: 
  // "🚨 EMERGÊNCIA SOS - ELAS
  //  Preciso de ajuda urgente.
  //  📍 Localização: https://maps.google.com/?q=LAT,LONG
  //  🕐 DATA HORA
  //  🔋 Bateria: X%"
}

export async function openWhatsAppPriority(contact: EmergencyContact, location: LocationData): Promise<void> {
  // Abre WhatsApp com número do contato prioritário
  // Mensagem pré-preenchida via wa.me/NUMERO?text=ENCODED_MESSAGE
}

export async function registerPushToken(token: string): Promise<void> {
  // Salva token na tabela push_tokens
}
```

### 6. Edge Function Supabase (CRIAR)
**Arquivo:** `supabase/functions/send-sos-push/index.ts`

```ts
// Recebe: { alert_id, user_id }
// Busca contatos de emergência do usuário
// Para cada contato que TEM expo_push_token cadastrado:
//   - Envia push via Expo Push API
//   - Mensagem: "🚨 [Nome] precisa de você!"
//   - Body: "Toque pra ver localização"
//   - Data: { alert_id, type: 'sos_alert' }
```

**Arquivo:** `supabase/functions/send-sos-cancel/index.ts`

```ts
// Recebe: { alert_id, user_id }
// Envia push pras mesmas amigas notificando que foi falso alarme
// Mensagem: "✓ [Nome] está segura"
// Body: "Foi acionamento acidental. Pode relaxar!"
```

### 7. Bibliotecas a instalar

```bash
npx expo install expo-notifications expo-haptics expo-battery
npm install @react-native-community/netinfo
```

### 8. Configurações em `app.json`

```json
{
  "expo": {
    "plugins": [
      [
        "expo-notifications",
        {
          "icon": "./assets/notification-icon.png",
          "color": "#FF4D7E"
        }
      ]
    ],
    "ios": {
      "infoPlist": {
        "NSLocationWhenInUseUsageDescription": "ELAS precisa da sua localização pra enviar pras amigas em caso de emergência.",
        "NSLocationAlwaysAndWhenInUseUsageDescription": "ELAS precisa da sua localização pra Modo Seguro funcionar mesmo com app fechado."
      }
    },
    "android": {
      "permissions": [
        "ACCESS_FINE_LOCATION",
        "ACCESS_COARSE_LOCATION",
        "SEND_SMS",
        "VIBRATE"
      ]
    }
  }
}
```

## 🎨 Paleta de cores (usar estas constantes)
```
- Coral principal: #FF4D7E
- Violeta: #A78BFA
- Dark background: #0A0A14
- Card background: rgba(255,77,126,0.08)
- Verde sucesso: #10B981
- Vermelho alerta: #DC2626
- Texto primário: #FFFFFF
- Texto secundário: #B4B4C7
```

## ✅ Checklist de implementação
- [ ] Rodar migration SQL no Supabase (manual via dashboard OU via supabase db push)
- [ ] Instalar bibliotecas (expo-notifications, expo-haptics, expo-battery, netinfo)
- [ ] Configurar app.json
- [ ] Reescrever SosButton.tsx (1 toque + router.push)
- [ ] Criar app/sos-countdown.tsx (tela vermelha + countdown 10s)
- [ ] Criar app/sos-aftermath.tsx (tela pós-SOS com 2 botões)
- [ ] Adicionar funções em lib/safety.ts (triggerSOS, markAsFalseAlarm, etc)
- [ ] Criar edge function send-sos-push
- [ ] Criar edge function send-sos-cancel
- [ ] Testar fluxo completo em dispositivo real (iOS ou Android)

## ⚠️ Observações importantes

1. **NÃO remover** as funções existentes do Modo Seguro — são separadas
2. **Preservar** toda a lógica do background_checks — é feature separada
3. **Compatibilidade:** o app deve continuar rodando no Expo Go durante desenvolvimento
4. **Sobre push notifications:** pra funcionar 100%, precisa de build real (EAS). No Expo Go funciona com limitações. É OK por enquanto.
5. **Sobre SMS:** apenas ABRE o app de SMS com mensagem pré-preenchida — usuário confirma envio (regra Apple/Google).
6. **Sobre WhatsApp:** usar wa.me URL scheme, que abre WhatsApp com mensagem pré-preenchida (1 toque pra enviar).

## 🧪 Teste manual após implementação
1. Abrir app
2. Tocar no botão SOS (sem segurar)
3. Ver tela vermelha com countdown de 10s
4. Aguardar sem tocar em nada
5. Após 10s, tela de aftermath deve aparecer
6. Testar botão "Foi engano" → deve voltar pra home
7. Repetir e testar "Ainda preciso de ajuda"
