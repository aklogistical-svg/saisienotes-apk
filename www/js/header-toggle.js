  /* ── toggleHeader – pill anchored to bottom of header ── */
  const headWrap        = document.getElementById('HeadWrap');
  const mainWrap        = document.getElementById('MainWrap');
  const toggleHeaderBtn = document.getElementById('toggleHeaderBtn');

  function getHeaderH() { return headWrap.getBoundingClientRect().height; }

  // position the pill right at the bottom edge of the header
  function positionPill(hidden) {
    const h = getHeaderH();
    toggleHeaderBtn.classList.toggle('is-hidden', hidden);
    if (hidden) {
      // header is off-screen → pill sits at top:0
      toggleHeaderBtn.style.top = '0px';
      toggleHeaderBtn.setAttribute('aria-label', "Afficher l'entête");
      toggleHeaderBtn.setAttribute('title',      "Afficher l'entête");
    } else {
      // header visible → pill hangs just below it
      toggleHeaderBtn.style.top = h + 'px';
      toggleHeaderBtn.setAttribute('aria-label', "Masquer l'entête");
      toggleHeaderBtn.setAttribute('title',      "Masquer l'entête");
    }
  }

  function toggleHeader() {
    const isHidden = headWrap.classList.toggle('header-hidden');
    if (isHidden) {
      mainWrap.style.marginTop = `-${getHeaderH()}px`;
    } else {
      mainWrap.style.marginTop = '0';
    }
    // wait for CSS transition then reposition
    setTimeout(() => positionPill(isHidden), 350);
    positionPill(isHidden); // instant update for the pill itself
  }

  // Init pill position
  positionPill(false);

  toggleHeaderBtn.addEventListener('click', toggleHeader);
