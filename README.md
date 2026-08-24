# Dr. Estomato

Protótipo web de acolhimento e orientação em saúde bucal para a rede SUS de São José dos Campos.

## Executar

Instale a dependência de Web Push e execute o servidor. A chave Gemini continua somente no servidor:

```bash
python3 -m pip install -r requirements.txt
GEMINI_API_KEY="sua-chave" python3 server.py
```

Depois acesse `http://localhost:8080`.

No macOS, a chave também pode ficar protegida no Keychain. O servidor procura automaticamente o item `dr-estomato-gemini` associado ao usuário atual:

```bash
read -s "GEMINI_API_KEY?Cole a chave: "; echo
security add-generic-password -U -a "$USER" -s "dr-estomato-gemini" -w "$GEMINI_API_KEY"
unset GEMINI_API_KEY
python3 server.py
```

## Incluído no protótipo

- mini-inquérito com consentimento;
- endereço estruturado com rua, número, apartamento/complemento, bairro e cidade;
- triagem conversacional com respostas em voz e entrada por voz quando suportada;
- acolhimento conversacional pela Gemini Interactions API, com fallback local automático;
- minimização de dados: informações cadastrais não são enviadas ao Gemini;
- voz masculina natural em português gerada pelo Gemini TTS, com fallback para a voz instalada no sistema;
- gravação de áudio de até 45 segundos, prévia e transcrição antes da triagem;
- classificação local conservadora em vermelho, amarelo ou verde;
- interrupção imediata do questionário diante de sinais graves;
- indicação regional de UBS ou UPA, rota no Google Maps e Central 156;
- histórico clínico objetivo;
- chat bidirecional persistente entre o cidadão e o navegador, vinculado ao atendimento por token privado;
- banco SQLite compartilhado no servidor, em `.data/`;
- aplicativo instalável (PWA), atualização automática da conversa e notificações Web Push;
- painel do navegador com filtros, acompanhamento, situação de acesso e mensagens;
- acesso administrativo validado pelo servidor (`navegador` / `UnespSJC` por padrão), com cookie de sessão protegido contra acesso por JavaScript;
- edição, exclusão e exportação do histórico pelo navegador.

## Notificações no celular

O cidadão deve concluir uma triagem e tocar em **Ativar notificações no celular**. Em produção, publique o app em HTTPS. No iPhone/iPad, o usuário precisa primeiro adicionar o app à Tela de Início; no Android, navegadores compatíveis podem autorizar diretamente. A notificação informa apenas que existe uma nova mensagem e não mostra dados clínicos na tela bloqueada.

As chaves VAPID são criadas automaticamente em `.data/vapid-private.pem`. Preserve esse arquivo entre publicações. Defina `VAPID_SUBJECT` com um e-mail institucional e altere as credenciais padrão com `NAVIGATOR_USER` e `NAVIGATOR_PASSWORD` antes de publicar.

## Limites importantes

Este ainda é um protótipo técnico. A chave do Gemini é lida somente pelo servidor e nunca deve ser colocada no `app.js` ou enviada ao repositório. Para uso real, são indispensáveis revisão clínica e jurídica, hospedagem institucional, HTTPS, backups criptografados, gestão de usuários, política de retenção, resposta a incidentes e adequação integral à LGPD. O protocolo determinístico de risco permanece ativo mesmo quando a IA está indisponível.

As unidades exibidas são referências regionais. A unidade de abrangência e o horário devem ser confirmados na Central 156 ou no site oficial da Prefeitura antes do deslocamento.
