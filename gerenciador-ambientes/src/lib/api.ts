//ÚNICO PONTO DE CONTATO DO FRONT COM O SERVIDOR
//todo componente chama api("/api/...") e recebe a resposta já como objeto (o JSON convertido)
//se o servidor responder com erro, a função lança um Error com a mensagem que o servidor mandou

//função que todos os componentes usam para buscar ou enviar dados
//url é o endereço (ex.: "/api/ambientes"), init é o resto do pedido (método, corpo...)
export async function api<T>(url: string, init?: RequestInit): Promise<T> {
  let r: Response;

  try {
    r = await fetch(url, { cache: "no-store", ...init }); //no-store: nunca usa resposta guardada, sempre busca de novo
  } catch {
    //o fetch só falha assim quando nem chegou ao servidor (servidor parado, sem rede)
    throw new Error("Não foi possível falar com o servidor.");
  }

  const data: unknown = await r.json().catch(() => ({})); //se a resposta não for JSON, usa um objeto vazio

  if (!r.ok) {
    //o servidor devolve os erros no formato { erro: "mensagem" }
    const msg = (data as { erro?: string }).erro;
    throw new Error(msg ?? `Erro ${r.status}`);
  }

  return data as T;
}