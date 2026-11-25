# Operação: a semana editorial

Fuso de referência: **America/Sao_Paulo**. Todos os horários no painel já aparecem convertidos; o banco guarda UTC.

| Dia | O que acontece | Onde, no painel |
| --- | --- | --- |
| Segunda | Lançar o desafio nas três redes | Desafios → novo; Gerador de roteiros; Biblioteca → card "Desafio" |
| Terça a quinta | Receber relatos e curtidas; divulgar lembretes | Biblioteca → card "Encerramento" |
| Quinta (horário da edição) | Encerrar e registrar a apuração | Relatos vencedores |
| Sexta | Confirmar elegibilidade, contatar e obter autorização | Relatos → consentimento |
| Sábado | Gerar, revisar e obter aprovação dos autores | Estúdio → Revisão |
| Domingo (horário da edição) | Publicar três mangás e a revista | Revisão → publicar; Revistas |

---

## Segunda — lançar

1. **Desafios → Novo desafio.** Número da edição, tema (um dos dez sugeridos ou personalizado), datas de lançamento, encerramento e publicação, e os links dos três posts assim que existirem. Status `LIVE`.
2. **Gerador de roteiros.** Escolha o tema e a velocidade de leitura (120, 150 ou 180 ppm). O roteiro sai com a copy aprovada, palavra por palavra — só o tema muda. Confira a duração estimada; acima de 60 s aparece um aviso. Copie e grave o vídeo. Voz, trilha, abertura e encerramento devem ser os mesmos toda semana.
3. Copie também a copy do X, com o contador de caracteres à vista.
4. **Biblioteca.** Gere o card "Desafio" no formato que precisar e baixe o PNG.

> O sistema não publica nas redes. A postagem é manual, de propósito.

## Quinta — apurar

Para cada rede, **Relatos vencedores → Registrar relato**:

- comentário original colado como está;
- URL de origem, número de curtidas e horário da apuração;
- horário do comentário, quando visível — é o critério de desempate;
- gênero, estilo, tom narrativo e tom visual pretendidos.

A triagem roda sozinha e avisa se encontrar identificadores pessoais, tentativa de injeção de instrução ou conteúdo bloqueado.

Registre também o segundo e o terceiro colocados de cada rede, com `rank` 2 e 3. Eles são a fila de reserva.

**Empate:** vence o comentário mais antigo quando o horário for verificável. Quando não for, a decisão é editorial e fica registrada na auditoria.

## Sexta — autorizar

1. Contate quem escreveu, pelo perfil público. Peça o pseudônimo que deve aparecer nos créditos.
2. No relato: autorização `Concedida`, evidência ("respondeu OK no DM em 21/11") e pseudônimo.
3. **Definir como vencedor da vaga.** O sistema recusa se faltar autorização, pseudônimo, autorização do responsável (menor de idade) ou se a vaga já estiver ocupada.
4. **Criar obra no estúdio.**

**Se não houver autorização, resposta ou relato elegível:** use *Liberar vaga*, escolha o motivo e escreva a justificativa. O sistema registra e indica o próximo elegível da **mesma rede**. Nada de inventar vencedor. Se não houver reserva, a edição pode sair com menos obras — use o aviso editorial da revista — ou ser adiada.

## Sábado — produzir

No **Estúdio**, por obra:

1. **Parâmetros.** Modo de qualidade, gênero, tons, intensidade de humor, fidelidade, cor, densidade de quadros, faixa de páginas e estilo de arte (dez cards com amostra).
2. **Gerar roteiro.** Confira a estimativa de custo antes. O roteiro volta editável: título, sinopse, fatos preservados, elementos ficcionalizados, páginas, quadros, diálogos e prompts visuais. Pode regerar só o roteiro quantas vezes quiser — é a parte barata.
3. **Aprovar roteiro.** Nenhuma imagem é gerada antes disso.
4. **Gerar páginas e capa.** Uma chamada por página. O progresso aparece na tela e pode ser cancelado.
5. **Revisão.** Confira continuidade, legibilidade, ortografia e fidelidade. Ajuste os balões (posição, texto, tipo), regenere apenas a página que não ficou boa, restaure uma versão anterior se precisar.
6. **Aprovação do autor.** Envie a prévia a quem escreveu e registre como a aprovação veio. Esse registro é obrigatório.
7. **Aprovar para publicação.**

> Mexer em qualquer coisa depois de aprovado **invalida a aprovação** e devolve a obra para revisão. É intencional: ninguém publica uma versão que o autor não viu.

## Domingo — publicar

1. Em cada obra: *Publicar agora* (com a caixa de confirmação marcada) ou *Agendar* para o horário da edição. O worker publica sozinho na hora marcada.
2. **Revistas → Nova revista.** Vincule à edição e use *Preencher com as obras aprovadas*: entram na ordem Instagram, TikTok, X.
3. Publique a revista depois das três obras. Ela reaproveita as páginas existentes — nenhuma geração nova.
4. **Biblioteca.** Cards "Vencedor" e "Lançamento" para divulgar.

## Rotina de acompanhamento

- **Visão geral:** vagas, fila, revisão, agendamentos, falhas e custo do mês.
- **Custos:** consumo por obra, tarifas em uso e registros sem custo verificável.
- A auditoria registra quem fez o quê, inclusive rejeições de CSRF e tentativas de login.

## Se algo quebrar

| Sintoma | O que fazer |
| --- | --- |
| Job falhou | Abra a obra; a mensagem da API aparece. Corrija e regere só o que faltou. |
| Geração travada | *Cancelar tarefas pendentes* no estúdio devolve a obra ao estado anterior. |
| Página ruim | Regere só ela; as outras não são tocadas. |
| Fala errada | Edite os balões. Não custa nada e não gera imagem nova. |
| Pedido de retirada | Despublique com o motivo. Sai do ar na hora; o histórico fica. |
| Orçamento estourado | A geração é bloqueada. Revise o teto ou confirme explicitamente. |
