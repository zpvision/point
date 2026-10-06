export function StepIcon({ code }: { code: string }) {
  const icon = (() => {
    switch (code) {
      case "organization":
        return (
          <>
            <rect x="8" y="3" width="10" height="18" rx="1.5" />
            <path d="M8 9H4v12h16M11 7h4M11 11h4M11 15h4M12 21v-3h2v3" />
          </>
        );
      case "point":
        return (
          <>
            <path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Z" />
            <circle cx="12" cy="10" r="2.3" />
          </>
        );
      case "capabilities":
        return (
          <>
            <path d="m12 3 9 5v9l-9 5-9-5V8l9-5Zm-9 5 9 5 9-5M12 13v9M7.5 5.5l9 5" />
          </>
        );
      case "schedule":
        return (
          <>
            <circle cx="12" cy="12" r="9" />
            <path d="M12 6v6l4 2" />
          </>
        );
      case "photos":
        return (
          <>
            <path d="M8 6 9.5 3h5L16 6h4a1 1 0 0 1 1 1v12H3V7a1 1 0 0 1 1-1h4Z" />
            <circle cx="12" cy="12" r="3" />
          </>
        );
      case "contact":
      case "account":
        return (
          <>
            <circle cx="12" cy="7" r="3" />
            <path d="M6 21v-3a6 6 0 0 1 12 0v3" />
          </>
        );
      case "review":
        return <path d="m3 12 4 4 9-9m-5 9 3 3L23 9" />;
      case "save":
        return (
          <>
            <path d="M4 3h12l4 4v14H4V3Z" />
            <path d="M8 3v6h8V3M8 21v-8h8v8" />
          </>
        );
      default:
        return (
          <>
            <rect x="4" y="4" width="6" height="6" rx="1" />
            <rect x="14" y="4" width="6" height="6" rx="1" />
            <rect x="4" y="14" width="6" height="6" rx="1" />
            <rect x="14" y="14" width="6" height="6" rx="1" />
          </>
        );
    }
  })();
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {icon}
    </svg>
  );
}
