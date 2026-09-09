/* =====================================================================
   SCRIPT DO SITE
   Funcionalidades:
   1) Alternar tema claro/escuro (e lembrar a escolha)
   2) Abrir/fechar o menu "três risquinhos" no celular
   3) Sombra no cabeçalho quando a página é rolada
   4) Rolagem suave até as seções, descontando a altura do cabeçalho fixo
   5) Ano atual no rodapé

   Observação: o tema já é aplicado por um pequeno script no <head> do
   index.html, para evitar o "flash" de tela clara ao carregar. Aqui
   cuidamos apenas do botão que troca o tema.
   ===================================================================== */

document.addEventListener("DOMContentLoaded", function () {

  /* -------------------------------------------------------------------
     1) TEMA CLARO / ESCURO
     ------------------------------------------------------------------- */
  var botaoTema = document.getElementById("botaoTema");
  var iconeTema = document.getElementById("iconeTema");
  var raiz = document.documentElement; // a tag <html>

  /* Descobre qual tema está ativo agora (o script do <head> pode já ter
     colocado data-tema="escuro"). */
  function temaAtual() {
    return raiz.getAttribute("data-tema") === "escuro" ? "escuro" : "claro";
  }

  /* Ajusta só o ícone do botão de acordo com o tema. */
  function atualizarIcone() {
    // lua = está claro (clique escurece) | sol = está escuro (clique clareia)
    iconeTema.textContent = temaAtual() === "escuro" ? "☀️" : "🌙";
  }
  atualizarIcone();

  /* Aplica um tema, troca o ícone e guarda a preferência no navegador. */
  function aplicarTema(tema) {
    if (tema === "escuro") {
      raiz.setAttribute("data-tema", "escuro");
    } else {
      raiz.removeAttribute("data-tema");
    }
    atualizarIcone();
    try {
      localStorage.setItem("tema", tema);
    } catch (e) {
      /* localStorage bloqueado: o tema muda mas não fica salvo */
    }
  }

  /* Ao clicar no botão, inverte o tema atual. */
  botaoTema.addEventListener("click", function () {
    aplicarTema(temaAtual() === "escuro" ? "claro" : "escuro");
  });


  /* -------------------------------------------------------------------
     2) MENU "TRÊS RISQUINHOS" (HAMBÚRGUER) NO CELULAR
     ------------------------------------------------------------------- */
  var botaoMenu = document.getElementById("botaoMenu");
  var menu = document.getElementById("menu");

  /* Abre ou fecha o menu e atualiza os atributos de acessibilidade. */
  function definirMenu(aberto) {
    menu.classList.toggle("menu--aberto", aberto);
    botaoMenu.setAttribute("aria-expanded", aberto ? "true" : "false");
    botaoMenu.setAttribute("aria-label", aberto ? "Fechar menu" : "Abrir menu");
  }

  botaoMenu.addEventListener("click", function () {
    var estaAberto = menu.classList.contains("menu--aberto");
    definirMenu(!estaAberto);
  });

  /* Ao clicar em qualquer link do menu, fecha o menu (útil no celular). */
  menu.querySelectorAll("a").forEach(function (link) {
    link.addEventListener("click", function () {
      definirMenu(false);
    });
  });


  /* -------------------------------------------------------------------
     3) SOMBRA NO CABEÇALHO AO ROLAR A PÁGINA
     ------------------------------------------------------------------- */
  var cabecalho = document.getElementById("cabecalho");

  function atualizarCabecalho() {
    cabecalho.classList.toggle("cabecalho--rolado", window.scrollY > 10);
  }
  atualizarCabecalho();               // roda uma vez ao carregar
  window.addEventListener("scroll", atualizarCabecalho);


  /* -------------------------------------------------------------------
     4) ROLAGEM SUAVE ATÉ AS SEÇÕES
     Descontamos a altura real do cabeçalho fixo para o título da seção
     não ficar escondido atrás dele. Respeita quem pediu menos animação.
     ------------------------------------------------------------------- */
  var prefereMenosMovimento =
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  document.querySelectorAll('a[href^="#"]').forEach(function (link) {
    link.addEventListener("click", function (evento) {
      var id = link.getAttribute("href");
      if (id === "#") return;

      var alvo = document.querySelector(id);
      if (!alvo) return;

      evento.preventDefault();
      var deslocamento = cabecalho.offsetHeight + 12; // altura do topo + folga
      var posicao =
        alvo.getBoundingClientRect().top + window.pageYOffset - deslocamento;

      window.scrollTo({
        top: posicao,
        behavior: prefereMenosMovimento ? "auto" : "smooth"
      });
    });
  });


  /* -------------------------------------------------------------------
     5) ANO ATUAL NO RODAPÉ
     ------------------------------------------------------------------- */
  var ano = document.getElementById("ano");
  if (ano) {
    ano.textContent = new Date().getFullYear();
  }

});
