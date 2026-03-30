/** Anexo exibido na bolha (historico mock). */
export type ChatAttachment =
  | {
      kind: "image";
      url: string;
      alt?: string;
      /** GIF (ex. Giphy): sem preview em tela cheia nem download. */
      asGif?: boolean;
      /** Figurinha: envio especial, sem balão. */
      asSticker?: boolean;
      /** Legenda sobre a figurinha (posição em % do centro). */
      captionOnSticker?: { text: string; xPercent: number; yPercent: number };
    }
  | { kind: "video"; url: string; posterUrl?: string }
  | { kind: "audio"; url: string }
  | {
      kind: "document";
      fileName: string;
      sizeLabel: string;
      /** URL para preview (PDF em iframe) e download. */
      url?: string;
    }
  | { kind: "contact"; name: string; subtitle?: string };

/** Resposta a outra mensagem (citacao). */
export type ChatReplyRef = {
  id: string;
  snippet: string;
  authorLabel: string;
};

/** Encaminhamento: conversa de origem e quem encaminhou. */
export type ChatForwardMeta = {
  fromConversationName: string;
  /** Nome de quem encaminhou (visível para o destinatário). */
  forwardedByName?: string;
};

/**
 * Ticks em mensagens enviadas (direct API):
 * - `sent` — 1 visto (enviado)
 * - `delivered` — 2 vistos (enviado e entregue)
 * - `read` — 2 vistos azuis (enviado, entregue e lido)
 */
export type OutgoingReceipt = "sent" | "delivered" | "read";

export type ChatMessage = {
  id: string;
  conversationId: string;
  sentAt: string;
  text: string;
  /** true = mensagem enviada por mim */
  outgoing: boolean;
  /** Em grupo, nome de quem enviou (mensagens recebidas). */
  senderName?: string;
  /** Em grupo, foto do remetente (URL pública da API). */
  senderAvatarUrl?: string | null;
  /** Midia, arquivo, cartao de contato etc. */
  attachment?: ChatAttachment;
  /** Mensagem citada (resposta). */
  replyTo?: ChatReplyRef;
  /** Mensagem encaminhada de outra conversa. */
  forwardOf?: ChatForwardMeta;
  /** Entregue / lida pelo destinatario (direct API). */
  outgoingReceipt?: OutgoingReceipt;
  /** 0–100 enquanto o anexo está a ser enviado (optimistic UI). */
  uploadProgress?: number;
  /** Conteúdo removido (apagar para todos) — só no destinatário. */
  deletedForEveryone?: boolean;
  /** Envio falhou (optimistic); permite reenviar. */
  sendFailed?: boolean;
  /** Sem rede: mensagem em fila até voltar online. */
  queuedOffline?: boolean;
};

/** Copia para outra conversa como encaminhada (sem citacao original). */
export function createForwardedChatMessage(
  original: ChatMessage,
  targetConversationId: string,
  sourceConversationName: string,
  forwardedByName?: string,
): ChatMessage {
  const attachment = original.attachment;
  return {
    id: `fwd-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    conversationId: targetConversationId,
    sentAt: new Date().toISOString(),
    text: original.text,
    outgoing: true,
    attachment: attachment ? { ...attachment } : undefined,
    forwardOf: {
      fromConversationName: sourceConversationName,
      ...(forwardedByName?.trim() ? { forwardedByName: forwardedByName.trim() } : {}),
    },
  };
}

/** Texto curto para citacao / preview. */
export function getMessageSnippet(message: ChatMessage): string {
  if (message.deletedForEveryone) return "Mensagem apagada";
  const t = message.text.trim();
  if (t) return t.length > 100 ? `${t.slice(0, 100)}…` : t;
  if (!message.attachment) return "Mensagem";
  switch (message.attachment.kind) {
    case "image":
      if (message.attachment.asSticker && message.attachment.captionOnSticker?.text?.trim()) {
        const c = message.attachment.captionOnSticker.text.trim();
        return c.length > 100 ? `${c.slice(0, 100)}…` : c;
      }
      if (message.attachment.asSticker) return "Figurinha";
      if (message.attachment.asGif) return "GIF";
      return "Foto";
    case "video":
      return "Video";
    case "audio":
      return "Audio";
    case "document":
      return message.attachment.fileName;
    case "contact":
      return `Contato: ${message.attachment.name}`;
    default:
      return "Mensagem";
  }
}

function stamp(hour: number, minute: number, dayOffset: number): string {
  const d = new Date();
  d.setDate(d.getDate() + dayOffset);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}

/** Mensagens mock por conversa; datas relativas ao dia atual (Hoje / Ontem funcionam). */
export function getMockConversationMessages(conversationId: string): ChatMessage[] {
  const byId: Record<string, ChatMessage[]> = {
    "c-1": [
      {
        id: "c1-a",
        conversationId: "c-1",
        sentAt: stamp(14, 20, -5),
        text: `Pessoal, alinhamos o forecast da semana?

Preciso que cada um atualize a planilha ate quarta: https://docs.google.com/spreadsheets/exemplo
Qualquer duvida me chamem no privado.`,
        outgoing: false,
        senderName: "Carlos Mendes",
      },
      {
        id: "c1-b",
        conversationId: "c-1",
        sentAt: stamp(14, 35, -5),
        text: `Consigo enviar a planilha ate umas 17h.

Ja deixei comentarios nas celulas em amarelo e marquei o que falta do time comercial. O link do drive e o mesmo de sempre: https://drive.google.com/folder/abc123`,
        outgoing: true,
        replyTo: {
          id: "c1-a",
          authorLabel: "Carlos Mendes",
          snippet:
            "Pessoal, alinhamos o forecast da semana? Preciso que cada um atualize a planilha ate quarta: https://docs.googl…",
        },
      },
      {
        id: "c1-c",
        conversationId: "c-1",
        sentAt: stamp(9, 5, -1),
        text: `Bom dia! Alguem viu o email do fornecedor?

Resumi aqui os pontos principais:
1) prazo de entrega mantido
2) precisamos da NF com CNPJ correto
3) documentacao extra esta em www.fornecedor-exemplo.com.br/docs`,
        outgoing: false,
        senderName: "Ana Ribeiro",
      },
      {
        id: "c1-d",
        conversationId: "c-1",
        sentAt: stamp(9, 12, -1),
        text: `Sim, respondi de manha. Estao aguardando assinatura.

Se quiserem acompanhar o protocolo: https://protocolo.empresa.com.br/ticket/88421`,
        outgoing: true,
        replyTo: {
          id: "c1-c",
          authorLabel: "Ana Ribeiro",
          snippet:
            "Bom dia! Alguem viu o email do fornecedor? Resumi aqui os pontos principais: 1) prazo de entrega mantido 2) precis…",
        },
      },
      {
        id: "c1-e",
        conversationId: "c-1",
        sentAt: stamp(18, 40, -1),
        text: `Caio, conforme sua preferencia, as alteracoes foram aplicadas.

Resumo do que mudou no modulo de relatorios: filtros por periodo, exportacao em CSV e a tela de detalhes agora puxa os dados em tempo quase real. Documentacao rapida: https://wiki.incall.local/relatorios-v2`,
        outgoing: false,
        senderName: "Carlos Mendes",
      },
      {
        id: "c1-f",
        conversationId: "c-1",
        sentAt: stamp(10, 8, 0),
        text: `Otimo, obrigado pelo retorno!

Vou validar com o time e te aviso ainda hoje.`,
        outgoing: true,
        replyTo: {
          id: "c1-e",
          authorLabel: "Carlos Mendes",
          snippet:
            "Caio, conforme sua preferencia, as alteracoes foram aplicadas. Resumo do que mudou no modulo de relatorios: filtros…",
        },
      },
      {
        id: "c1-g",
        conversationId: "c-1",
        sentAt: stamp(10, 42, 0),
        text: `Equipe, lembrem do cliente X na call das 15h.

Pauta sugerida:
- status do rollout
- riscos e dependencias
- proximos passos ate sexta`,
        outgoing: false,
        senderName: "Carlos Mendes",
      },
      {
        id: "c1-h",
        conversationId: "c-1",
        sentAt: stamp(10, 44, 0),
        text: `E lembrem de levar o material impresso.

Lista: https://share.incall.local/materiais/cliente-x-call.pdf`,
        outgoing: false,
        senderName: "Carlos Mendes",
      },
      {
        id: "c1-h2",
        conversationId: "c-1",
        sentAt: stamp(10, 46, 0),
        text: "O juridico liberou o SLA assinado. Qualquer coisa me pinga.",
        outgoing: false,
        senderName: "Ana Ribeiro",
        attachment: {
          kind: "document",
          fileName: "SLA_cliente_X_vfinal.pdf",
          sizeLabel: "418 KB",
          url: "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf",
        },
      },
      {
        id: "c1-h3",
        conversationId: "c-1",
        sentAt: stamp(10, 51, 0),
        text: "Foto do quadro da retrospectiva — os itens em vermelho sao bloqueantes.",
        outgoing: false,
        senderName: "Carlos Mendes",
        attachment: {
          kind: "image",
          url: "https://picsum.photos/seed/incallretro/780/440",
          alt: "Quadro retrospectiva",
        },
      },
      {
        id: "c1-i",
        conversationId: "c-1",
        sentAt: stamp(11, 2, 0),
        text: "Segue o cronograma consolidado em PDF.",
        outgoing: true,
        attachment: {
          kind: "document",
          fileName: "cronograma_time_q2.pdf",
          sizeLabel: "842 KB",
          url: "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf",
        },
      },
      {
        id: "c1-j",
        conversationId: "c-1",
        sentAt: stamp(11, 6, 0),
        text: "Print do dashboard que comentei na daily.",
        outgoing: true,
        attachment: {
          kind: "image",
          url: "https://picsum.photos/seed/incalldash/720/420",
          alt: "Dashboard",
        },
      },
      {
        id: "c1-k",
        conversationId: "c-1",
        sentAt: stamp(11, 11, 0),
        text: "Trecho do video que o cliente mandou sobre o escopo. Vale a pena ver antes da call.",
        outgoing: false,
        senderName: "Ana Ribeiro",
        attachment: {
          kind: "video",
          url: "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4",
          posterUrl: "https://picsum.photos/seed/incallclientevid/640/360",
        },
      },
      {
        id: "c1-l",
        conversationId: "c-1",
        sentAt: stamp(11, 16, 0),
        text: "Te passei o contato do PM do lado do cliente — ele pediu pra falar contigo direto.",
        outgoing: false,
        senderName: "Ana Ribeiro",
        attachment: {
          kind: "contact",
          name: "Ricardo Vargas",
          subtitle: "PM · ricardo.vargas@cliente-x.com · +55 11 97766-5544",
        },
      },
    ],
    "c-2": [
      {
        id: "c2-a",
        conversationId: "c-2",
        sentAt: stamp(11, 0, -1),
        text: `Ola! Preciso renovar meu plano Premium.

Estou na versao atual ha dois anos e queria saber se ha desconto para pagamento anual.`,
        outgoing: true,
      },
      {
        id: "c2-b",
        conversationId: "c-2",
        sentAt: stamp(11, 4, -1),
        text: `Ola! Posso ajudar. Qual o email da sua conta?

Assim localizo o contrato e te envio as opcoes de renovacao com valores atualizados.`,
        outgoing: false,
        replyTo: {
          id: "c2-a",
          authorLabel: "Você",
          snippet:
            "Ola! Preciso renovar meu plano Premium. Estou na versao atual ha dois anos e queria saber se ha desconto para…",
        },
      },
      {
        id: "c2-b2",
        conversationId: "c-2",
        sentAt: stamp(11, 6, -1),
        text: "Segue um print da sua tela de assinatura e o PDF com o comparativo Premium x Business (valores sem IOF).",
        outgoing: false,
        attachment: {
          kind: "image",
          url: "https://picsum.photos/seed/incallsuporteconta/720/420",
          alt: "Painel da conta Incall",
        },
      },
      {
        id: "c2-b3",
        conversationId: "c-2",
        sentAt: stamp(11, 8, -1),
        text: "",
        outgoing: false,
        attachment: {
          kind: "document",
          fileName: "comparativo_planos_2026.pdf",
          sizeLabel: "612 KB",
          url: "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf",
        },
      },
      {
        id: "c2-c",
        conversationId: "c-2",
        sentAt: stamp(11, 10, -1),
        text: `contato@empresa.com.br

Esse e o email cadastrado na fatura.`,
        outgoing: true,
      },
      {
        id: "c2-d",
        conversationId: "c-2",
        sentAt: stamp(9, 20, 0),
        text: `Encontramos sua conta. Segue o link para renovacao:

https://app.incall.com.br/renew?token=preview

Qualquer problema ao acessar, me avise com print da tela.`,
        outgoing: false,
      },
      {
        id: "c2-e",
        conversationId: "c-2",
        sentAt: stamp(9, 35, 0),
        text: "Comprovante de pagamento.",
        outgoing: true,
        attachment: {
          kind: "document",
          fileName: "comprovante_pix_2026.pdf",
          sizeLabel: "312 KB",
          url: "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf",
        },
      },
      {
        id: "c2-f",
        conversationId: "c-2",
        sentAt: stamp(9, 38, 0),
        text: "",
        outgoing: true,
        attachment: {
          kind: "contact",
          name: "Financeiro Incall",
          subtitle: "financeiro@incall.com.br · +55 11 4000-0000",
        },
      },
    ],
    "c-3": [
      {
        id: "c3-a",
        conversationId: "c-3",
        sentAt: stamp(16, 10, -2),
        text: "Voce viu o convite do jantar sexta?",
        outgoing: false,
      },
      {
        id: "c3-b",
        conversationId: "c-3",
        sentAt: stamp(16, 22, -2),
        text: "Vi sim! Confirmo presenca.",
        outgoing: true,
      },
      {
        id: "c3-c",
        conversationId: "c-3",
        sentAt: stamp(14, 5, 0),
        text: "Mandei as fotos do evento no drive.",
        outgoing: false,
      },
      {
        id: "c3-c1",
        conversationId: "c-3",
        sentAt: stamp(14, 12, 0),
        text: "Essa foto saiu boa demais — a gente no palco. Ja postei no storiest tambem.",
        outgoing: false,
        attachment: {
          kind: "image",
          url: "https://picsum.photos/seed/incallpalco/800/520",
          alt: "Time no palco",
        },
      },
      {
        id: "c3-c2",
        conversationId: "c-3",
        sentAt: stamp(14, 18, 0),
        text: "Video curtinho do brinde do sponsor, pra voce ver o angulo.",
        outgoing: false,
        attachment: {
          kind: "video",
          url: "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4",
          posterUrl: "https://picsum.photos/seed/incallbrinde/640/360",
        },
      },
      {
        id: "c3-c3",
        conversationId: "c-3",
        sentAt: stamp(14, 24, 0),
        text: "To correndo no metro, te explico o rolê do restaurante no audio.",
        outgoing: false,
        attachment: {
          kind: "audio",
          url: "https://interactive-examples.mdn.mozilla.net/media/cc0-audio/t-rex-roar.mp3",
        },
      },
      {
        id: "c3-c4",
        conversationId: "c-3",
        sentAt: stamp(14, 31, 0),
        text: "Planilha com os convidados confirmados e a coluna de restricao alimentar.",
        outgoing: false,
        attachment: {
          kind: "document",
          fileName: "lista_convidados_evento.xlsx",
          sizeLabel: "88 KB",
          url: "https://raw.githubusercontent.com/SheetJS/test_files/master/xlsx/numbers.xlsx",
        },
      },
      {
        id: "c3-c5",
        conversationId: "c-3",
        sentAt: stamp(14, 38, 0),
        text: "Contrato do buffet que a Mari mandou assinado. Da uma olhada na clausula 4.",
        outgoing: false,
        attachment: {
          kind: "document",
          fileName: "contrato_buffet_jantar.pdf",
          sizeLabel: "1,1 MB",
          url: "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf",
        },
      },
      {
        id: "c3-c6",
        conversationId: "c-3",
        sentAt: stamp(14, 45, 0),
        text: "Te mandei o contato do coordenador do salão — ele resolve estacionamento e mesa.",
        outgoing: false,
        attachment: {
          kind: "contact",
          name: "Felipe Amaral",
          subtitle: "Coord. eventos · felipe@salaoaurora.com · +55 11 3456-7890",
        },
      },
      {
        id: "c3-d",
        conversationId: "c-3",
        sentAt: stamp(15, 8, 0),
        text: "Foto do estande na feira ontem.",
        outgoing: true,
        attachment: {
          kind: "image",
          url: "https://picsum.photos/seed/incallfeira/800/520",
          alt: "Estande na feira",
        },
      },
      {
        id: "c3-e",
        conversationId: "c-3",
        sentAt: stamp(15, 11, 0),
        text: "Trecho do video que gravei no stand.",
        outgoing: true,
        attachment: {
          kind: "video",
          url: "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4",
          posterUrl: "https://picsum.photos/seed/incallvideo/640/360",
        },
      },
      {
        id: "c3-f",
        conversationId: "c-3",
        sentAt: stamp(15, 16, 0),
        text: "Resumo em audio porque estou entre reunioes.",
        outgoing: true,
        attachment: {
          kind: "audio",
          url: "https://interactive-examples.mdn.mozilla.net/media/cc0-audio/t-rex-roar.mp3",
        },
      },
      {
        id: "c3-g",
        conversationId: "c-3",
        sentAt: stamp(15, 20, 0),
        text: "Planilha de convidados e orcamento aproximado.",
        outgoing: true,
        attachment: {
          kind: "document",
          fileName: "evento_convites_orcamento.xlsx",
          sizeLabel: "1,2 MB",
          url: "https://raw.githubusercontent.com/SheetJS/test_files/master/xlsx/numbers.xlsx",
        },
      },
      {
        id: "c3-h",
        conversationId: "c-3",
        sentAt: stamp(15, 24, 0),
        text: "",
        outgoing: true,
        attachment: {
          kind: "contact",
          name: "Ana Ribeiro",
          subtitle: "+55 21 98888-7766 · ana.ribeiro@email.com",
        },
      },
    ],
    "c-4": [
      {
        id: "c4-a",
        conversationId: "c-4",
        sentAt: stamp(20, 15, -3),
        text: "Te ligo amanha sobre o projeto.",
        outgoing: false,
      },
      {
        id: "c4-a2",
        conversationId: "c-4",
        sentAt: stamp(20, 22, -3),
        text: "Segue o escopo em PDF que alinhei com o designer. Ve se fecha pra ti antes de eu mandar pro cliente.",
        outgoing: false,
        attachment: {
          kind: "document",
          fileName: "escopo_app_v3.pdf",
          sizeLabel: "956 KB",
          url: "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf",
        },
      },
      {
        id: "c4-a3",
        conversationId: "c-4",
        sentAt: stamp(20, 28, -3),
        text: "Foto do wireframe no papel — ficou assim a navegacao principal.",
        outgoing: false,
        attachment: {
          kind: "image",
          url: "https://picsum.photos/seed/incallwire/720/480",
          alt: "Wireframe papel",
        },
      },
      {
        id: "c4-a4",
        conversationId: "c-4",
        sentAt: stamp(20, 35, -3),
        text: "Resumo rapido em audio do que combinamos com o Lucas hoje.",
        outgoing: false,
        attachment: {
          kind: "audio",
          url: "https://interactive-examples.mdn.mozilla.net/media/cc0-audio/t-rex-roar.mp3",
        },
      },
      {
        id: "c4-b",
        conversationId: "c-4",
        sentAt: stamp(20, 40, -3),
        text: "Combinado! Vou revisar o PDF e te dou retorno ate meio dia.",
        outgoing: true,
      },
    ],
    "c-5": [
      {
        id: "c5-a",
        conversationId: "c-5",
        sentAt: stamp(11, 35, -4),
        text: "Pessoal, revisem o briefing para a campanha de abril.",
        outgoing: false,
        senderName: "Julia Alves",
      },
      {
        id: "c5-b",
        conversationId: "c-5",
        sentAt: stamp(14, 50, -1),
        text: "Subi comentarios no doc compartilhado.",
        outgoing: true,
      },
      {
        id: "c5-c",
        conversationId: "c-5",
        sentAt: stamp(15, 2, 0),
        text: "Time, deadline interno e sexta 12h.",
        outgoing: false,
        senderName: "Julia Alves",
      },
      {
        id: "c5-c2",
        conversationId: "c-5",
        sentAt: stamp(15, 8, 0),
        text: "Subi o PDF oficial do briefing no drive tambem, mas deixo anexado aqui pra quem nao viu.",
        outgoing: false,
        senderName: "Julia Alves",
        attachment: {
          kind: "document",
          fileName: "briefing_campanha_abril_oficial.pdf",
          sizeLabel: "3,1 MB",
          url: "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf",
        },
      },
      {
        id: "c5-c3",
        conversationId: "c-5",
        sentAt: stamp(15, 14, 0),
        text: "Ref visual que achei no Pinterest — cores bem parecidas com o que o cliente pediu.",
        outgoing: false,
        senderName: "Bruno Costa",
        attachment: {
          kind: "image",
          url: "https://picsum.photos/seed/incallrefvisual/640/640",
          alt: "Referencia visual",
        },
      },
      {
        id: "c5-c4",
        conversationId: "c-5",
        sentAt: stamp(15, 19, 0),
        text: "Planilha de midia com verbas por canal — pode duplicar a aba por regiao.",
        outgoing: false,
        senderName: "Julia Alves",
        attachment: {
          kind: "document",
          fileName: "midia_abril_verbas.xlsx",
          sizeLabel: "156 KB",
          url: "https://raw.githubusercontent.com/SheetJS/test_files/master/xlsx/numbers.xlsx",
        },
      },
      {
        id: "c5-d",
        conversationId: "c-5",
        sentAt: stamp(15, 30, 0),
        text: "Moodboard rapido para alinharmos a arte.",
        outgoing: true,
        attachment: {
          kind: "image",
          url: "https://picsum.photos/seed/incallmood/640/640",
          alt: "Moodboard",
        },
      },
      {
        id: "c5-e",
        conversationId: "c-5",
        sentAt: stamp(15, 35, 0),
        text: "Briefing oficial em PDF para o time de criacao.",
        outgoing: true,
        attachment: {
          kind: "document",
          fileName: "briefing_campanha_abril.pdf",
          sizeLabel: "2,4 MB",
          url: "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf",
        },
      },
    ],
  };

  return byId[conversationId] ?? [
    {
      id: "fallback",
      conversationId,
      sentAt: stamp(12, 0, 0),
      text: "Nenhuma mensagem ainda. Digite abaixo para comecar.",
      outgoing: false,
    },
  ];
}
