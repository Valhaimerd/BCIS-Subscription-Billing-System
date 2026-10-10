import { ArrowUpRight, type LucideIcon } from 'lucide-react';

export function WorkCard({
  title,
  context,
  action,
  status,
  icon: Icon,
  onClick,
  tone = 'default',
}: {
  title: string;
  context: string;
  action: string;
  status?: string | undefined;
  icon: LucideIcon;
  onClick: () => void;
  tone?: 'default' | 'attention';
}) {
  return (
    <button
      className={`work-card work-card--${tone}`}
      onClick={onClick}
      type="button"
    >
      <span className="work-card-icon" aria-hidden="true">
        <Icon size={20} />
      </span>
      <span className="work-card-copy">
        {status ? <span className="work-card-status">{status}</span> : null}
        <strong>{title}</strong>
        <span>{context}</span>
        <span className="work-card-action">
          {action}
          <ArrowUpRight aria-hidden="true" size={16} />
        </span>
      </span>
    </button>
  );
}
