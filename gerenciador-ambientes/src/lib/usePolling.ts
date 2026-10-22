"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "./api";

//busca os dados de uma URL e repete a busca a cada `intervaloMs` milissegundos, para a tela se atualizar sozinha (faz o polling)
//o <T> é o tipo do dado esperado
export function usePolling<T>(url: string, intervaloMs = 3000) {
  //o que a API respondeu (null até a primeira resposta chegar)
  const [data, setData] = useState<T | null>(null);
  //mensagem de erro, se a busca falhar (null = sem erro)
  const [erro, setErro] = useState<string | null>(null);
  //true só até a primeira resposta, para a tela mostrar "Carregando…"
  const [carregando, setCarregando] = useState(true);

  //função que faz uma busca na API
  async function buscar() {
    try {
      setData(await api<T>(url)); //guarda a resposta
      setErro(null); //deu certo, limpa qualquer erro anterior
    } catch (e) {
      setErro((e as Error).message); //falhou, guarda a mensagem para mostrar
    } finally {
      setCarregando(false); //com sucesso ou erro, a primeira busca já terminou
    }
  }

  //"memoriza" a função para ela só ser recriada se o url mudar, assim o useEffect abaixo não reinicia o repetidor a cada redesenho da tela
  //os botões das telas (encerrar, remover...) usam recarregar() para atualizar na hora
  const recarregar = useCallback(buscar, [url]);

  //roda a cada repetição: busca, mas só se a aba estiver visível
  function buscarSeVisivel() {
    const abaVisivel = !document.hidden;
    if (abaVisivel) {
      void recarregar();
    }
  }

  //liga o repetidor e devolve a função que o desliga (o React a chama quando a tela fecha)
  function ligarRepetidor() {
    void recarregar(); //primeira busca, assim que a tela abre

    //repete buscarSeVisivel a cada intervaloMs milissegundos
    const t = setInterval(buscarSeVisivel, intervaloMs);

    //limpeza: ao sair da tela, para o repetidor (senão cada visita deixaria um rodando)
    function desligar() {
      clearInterval(t);
    }

    //devolve a função sem executá-la (sem os parênteses), o React a chama quando a tela fecha
    return desligar;
  }

  //liga o repetidor quando a tela abre e desliga quando ela fecha
  useEffect(ligarRepetidor, [recarregar, intervaloMs]);

  //o que a tela recebe para usar
  return { data, erro, carregando, recarregar };
}