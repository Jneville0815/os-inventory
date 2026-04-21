import { useEffect, useState } from 'react';

type Props = {
  command: string | null;
};

export default function CopyCommandButton({ command }: Props): React.JSX.Element | null {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1600);
    return () => clearTimeout(t);
  }, [copied]);

  if (command === null) return null;

  const disabled = command.length === 0;

  const onClick = async (): Promise<void> => {
    if (disabled) return;
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
    } catch {
      // Clipboard API can fail if the window isn't focused — swallow silently.
    }
  };

  return (
    <button
      className="copy-button"
      onClick={onClick}
      disabled={disabled}
      title={disabled ? 'Nothing to upgrade' : command}
      aria-label="Copy upgrade command"
    >
      {copied ? (
        <>
          <svg
            width="14"
            height="14"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <polyline points="3 8 7 12 13 4" />
          </svg>
          Copied
        </>
      ) : (
        <>
          <svg
            width="14"
            height="14"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <rect x="4" y="3" width="9" height="11" rx="1.5" />
            <path d="M6 3V2a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v1" />
          </svg>
          Copy upgrade command
        </>
      )}
    </button>
  );
}
