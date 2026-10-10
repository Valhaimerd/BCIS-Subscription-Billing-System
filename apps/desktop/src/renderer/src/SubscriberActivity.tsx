import type { PermissionCode, SubscriberActivityDto } from '@bcis/contracts';
import { ArrowRight, History } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import type { AppViewId } from './navigation';

const PAGE_SIZE = 20;
const money = (value: number) =>
  new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(
    value / 100,
  );

function targetView(
  event: SubscriberActivityDto,
  permissions: readonly PermissionCode[],
): AppViewId | null {
  const target: Record<
    SubscriberActivityDto['category'],
    [AppViewId, PermissionCode]
  > = {
    SUBSCRIBER: ['Subscribers', 'subscriber.view'],
    SERVICE: ['Services', 'service.view'],
    BILLING: ['Billing', 'billing.view'],
    PAYMENT: ['Payments', 'payment.view'],
    COLLECTION: ['Collections', 'collection.view'],
  };
  const [view, permission] = target[event.category];
  return permissions.includes(permission) ? view : null;
}

export function SubscriberActivity({
  subscriberId,
  permissions,
  onNavigate,
}: {
  subscriberId: string;
  permissions: readonly PermissionCode[];
  onNavigate: (view: AppViewId) => void;
}): React.JSX.Element {
  const [items, setItems] = useState<SubscriberActivityDto[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const requestSequence = useRef(0);

  useEffect(() => {
    const request = ++requestSequence.current;
    setItems([]);
    setPage(1);
    setTotal(0);
    setLoading(true);
    setError('');
    void window.bcis?.masterData
      .activity(subscriberId, { page: 1, pageSize: PAGE_SIZE })
      .then((result) => {
        if (request === requestSequence.current) {
          setItems(result.items);
          setPage(result.page);
          setTotal(result.total);
        }
      })
      .catch((caught: unknown) => {
        if (request === requestSequence.current)
          setError(
            caught instanceof Error
              ? caught.message
              : 'Could not load account activity.',
          );
      })
      .finally(() => {
        if (request === requestSequence.current) setLoading(false);
      });
    return () => {
      if (request === requestSequence.current) requestSequence.current += 1;
    };
  }, [subscriberId]);

  async function loadMore() {
    const request = ++requestSequence.current;
    try {
      setLoading(true);
      setError('');
      const nextPage = page + 1;
      const result = await window.bcis!.masterData.activity(subscriberId, {
        page: nextPage,
        pageSize: PAGE_SIZE,
      });
      if (request !== requestSequence.current) return;
      setItems((current) => [...current, ...result.items]);
      setPage(result.page);
      setTotal(result.total);
    } catch (caught) {
      if (request !== requestSequence.current) return;
      setError(
        caught instanceof Error
          ? caught.message
          : 'Could not load account activity.',
      );
    } finally {
      if (request === requestSequence.current) setLoading(false);
    }
  }

  return (
    <section
      className="data-card subscriber-activity"
      aria-labelledby="activity-heading"
    >
      <div className="card-heading">
        <div>
          <span>Account history</span>
          <h2 id="activity-heading">Activity</h2>
        </div>
        <span className="activity-total">{total} events</span>
      </div>
      {error ? (
        <div className="form-error" role="alert">
          {error}
        </div>
      ) : null}
      {loading && !items.length ? (
        <div className="empty-state" role="status">
          Loading account activity…
        </div>
      ) : null}
      {!loading && !error && !items.length ? (
        <div className="empty-state activity-empty">
          <History aria-hidden="true" />
          <strong>No account activity yet</strong>
          <span>
            Service, billing, payment, and collection updates will appear here.
          </span>
        </div>
      ) : null}
      {items.length ? (
        <ol className="activity-timeline">
          {items.map((item) => {
            const view = targetView(item, permissions);
            return (
              <li key={item.id}>
                <span
                  className={`activity-marker activity-${item.category.toLowerCase()}`}
                  aria-hidden="true"
                />
                <div className="activity-item">
                  <div className="activity-item-heading">
                    <div>
                      <span className="activity-category">
                        {item.category.toLowerCase()}
                      </span>
                      <h3>{item.label}</h3>
                    </div>
                    <time dateTime={item.occurredAt}>
                      {new Date(item.occurredAt).toLocaleString()}
                    </time>
                  </div>
                  <div className="activity-details">
                    {item.reference ? (
                      <span>
                        Reference <strong>{item.reference}</strong>
                      </span>
                    ) : null}
                    {item.status ? (
                      <span>
                        Status <strong>{item.status}</strong>
                      </span>
                    ) : null}
                    {item.amountCentavos !== null ? (
                      <span>
                        Amount <strong>{money(item.amountCentavos)}</strong>
                      </span>
                    ) : null}
                  </div>
                  {item.reason ? <p>{item.reason}</p> : null}
                  {view ? (
                    <button
                      className="activity-open"
                      onClick={() => onNavigate(view)}
                      type="button"
                    >
                      Open {view.toLowerCase()}{' '}
                      <ArrowRight aria-hidden="true" size={15} />
                    </button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ol>
      ) : null}
      {items.length < total ? (
        <button
          className="secondary-action activity-more"
          disabled={loading}
          onClick={() => void loadMore()}
          type="button"
        >
          {loading ? 'Loading…' : 'Load more activity'}
        </button>
      ) : null}
    </section>
  );
}
