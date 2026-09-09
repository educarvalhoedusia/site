/* =====================================================================
   SCRIPT DO SITE
   Três funcionalidades simples:
   1) Alternar tema claro/escuro (e lembrar a escolha)
   2) Abrir/fechar o menu "três risquinhos" no celular
   3) Reforçar a rolagem suave ao clicar nos links do menu
   ===================================================================== */

/* Espera o HTML terminar de carregar antes de mexer nos elementos. */
document.addEventListener("DOMContentLoaded", function () {

  /* -------------------------------------------------------------------
     1) TEMA CLARO / ESCURO
     ------------------------------------------------------------------- */
  var botaoTema = document.getElementById("botaoTema");
  var iconeTema = document.getElementById("iconeTema");
  var raiz = document.documentElement; // é a tag <html>

  /* Aplica um tema ("claro" ou "escuro"): muda o atributo do <html>,
     troca o ícone e guarda a preferência no navegador (localStorage). */
  function aplicarTema(tema) {
    if (tema === "escuro") {
      raiz.setAttribute("data-tema", "escuro");
      iconeTema.textContent = "☀️"; // mostra o sol (clique volta pro claro)
    } else {
      raiz.removeAttribute("data-tema");
      iconeTema.textContent = "🌙"; // mostra a lua (clique vai pro escuro)
    }
    localStorage.setItem("tema", tema);
  }

  /* Na primeira visita não há preferência salva: usamos a configuração
     do sistema operacional do visitante (prefers-color-scheme). */
  var temaSalvo = localStorage.getItem("tema");
  if (temaSalvo) {
    aplicarTema(temaSalvo);
  } else if (window.matchMedia("(prefers-color-scheme: dark)").matches) {
    aplicarTema("escuro");
  } else {
    aplicarTema("claro");
  }

  /* Ao clicar no botão, inverte o tema atual. */
  botaoTema.addEventListener("click", function () {
    var temaAtual = raiz.getAttribute("data-tema") === "escuro" ? "escuro" : "claro";
    aplicarTema(temaAtual === "escuro" ? "claro" : "escuro");
  });


  /* -------------------------------------------------------------------
     2) MENU "TRÊS RISQUINHOS" (HAMBÚRGUER) NO CELULAR
     ------------------------------------------------------------------- */
  var botaoMenu = document.getElementById("botaoMenu");
  var menu = document.getElementById("menu");

  /* Abre ou fecha o menu adicionando/removendo a classe CSS. */
  botaoMenu.addEventListener("click", function () {
    var aberto = menu.classList.toggle("menu--aberto");
    // acessibilidade: informa se o menu está aberto
    botaoMenu.setAttribute("aria-expanded", aberto ? "true" : "false");
  });

  /* Ao clicar em qualquer link do menu, fecha o menu (útil no celular). */
  var linksMenu = menu.querySelectorAll("a");
  linksMenu.forEach(function (link) {
    link.addEventListener("click", function () {
      menu.classList.remove("menu--aberto");
      botaoMenu.setAttribute("aria-expanded", "false");
    });
  });


  /* -------------------------------------------------------------------
     3) ROLAGEM SUAVE AO CLICAR NOS LINKS INTERNOS
     O CSS já faz isso (scroll-behavior: smooth), mas aqui garantimos
     o mesmo comportamento em navegadores antigos.
     ------------------------------------------------------------------- */
  var linksInternos = document.querySelectorAll('a[href^="#"]');
  linksInternos.forEach(function (link) {
    link.addEventListener("click", function (evento) {
      var alvo = document.querySelector(link.getAttribute("href"));
      if (alvo) {
        evento.preventDefault();
        alvo.scrollIntoView({ behavior: "smooth" });
      }
    });
  });


  /* -------------------------------------------------------------------
     4) ANO ATUAL NO RODAPÉ
     Preenche automaticamente o <span id="ano"> com o ano corrente.
     ------------------------------------------------------------------- */
  var ano = document.getElementById("ano");
  if (ano) {
    ano.textContent = new Date().getFullYear();
  }

});
