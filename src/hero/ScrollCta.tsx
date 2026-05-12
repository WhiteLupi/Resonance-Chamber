export function ScrollCta() {
  const handleClick = () => {
    document
      .getElementById('about')
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <button
      type="button"
      className="cockpit-scroll"
      onClick={handleClick}
      aria-label="scroll to next section"
    >
      <svg
        className="cockpit-scroll__chevron"
        viewBox="0 0 24 30"
        fill="none"
        aria-hidden="true"
      >
        <path d="M3 4 L12 11 L21 4" />
        <path d="M3 13 L12 20 L21 13" />
        <path d="M3 22 L12 29 L21 22" />
      </svg>
    </button>
  );
}
