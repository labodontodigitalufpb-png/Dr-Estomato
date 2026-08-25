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
- perguntas clínicas imediatas no navegador, sem aguardar uma chamada de IA a cada etapa;
- minimização de dados: informações cadastrais não são enviadas ao Gemini;
- transcrição de áudio e leitura da orientação final pela Gemini Interactions API;
- leitura imediata das perguntas pela voz instalada no sistema e voz natural do Gemini na orientação final, ambas com fallback local;
- resposta direta por voz, com reconhecimento e envio automáticos; em navegadores sem ditado nativo, gravação temporária de até 45 segundos e transcrição automática sem etapa de prévia;
- classificação local conservadora em vermelho, amarelo ou verde;
- identificação explícita de alterações que exigem avaliação presencial, como ferida ou úlcera, manchas brancas ou vermelhas e caroço ou endurecimento;
- interrupção imediata do questionário diante de sinais graves;
- busca da UBS ou UPA mais próxima a partir do endereço ou localização compartilhada, rota no Google Maps e Central 156;
- opção de avaliação prioritária no Ambulatório de Estomatologia (CEDOB) do ICT/UNESP, com rota e telefone para confirmação;
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

## Referência clínica

As informações relacionadas à identificação e à avaliação de alterações suspeitas na boca têm como referência:

> BRASIL. Ministério da Saúde. Secretaria de Atenção Primária à Saúde. Departamento de Saúde da Família e Comunidade. *Diretriz para a prática clínica odontológica na Atenção Primária à Saúde: condutas para diagnóstico das desordens orais potencialmente malignas e do câncer de boca*. Brasília: Ministério da Saúde, 2023. ISBN 978-65-5993-514-7. Disponível em: <https://bvsms.saude.gov.br/bvs/publicacoes/diretriz_pratica_odontologica_aps_cancer.pdf>.

> BONAN, Paulo Rogério Ferreti; PEREZ, Danyel Elias da Cruz; MÉLO, Cláudia Batista. *Diagnóstico diferencial de lesões bucais na clínica odontológica*. João Pessoa: Edição do Autor, 2014. 125 p. ISBN 978-85-914984-2-0.

A diretriz sustenta o exame clínico presencial e recomenda biópsia ou encaminhamento imediato ao serviço de referência diante de lesão suspeita. Para lesão aparentemente inócua ou de diagnóstico clínico desconhecido, recomenda acompanhamento e, se houver persistência ou progressão ou não for possível descartar uma desordem oral potencialmente maligna, biópsia ou encaminhamento. O livro complementa a fundamentação sobre anamnese, exame físico intraoral e caracterização de lesões fundamentais, incluindo manchas e máculas, erosões, placas, nódulos, pápulas, úlceras, bolhas, vesículas e tumores. O protótipo apenas identifica prioridade e orienta a busca de cuidado; ele não realiza diagnóstico nem indica biópsia diretamente ao cidadão.
