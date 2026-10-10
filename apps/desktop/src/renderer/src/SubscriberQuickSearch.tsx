import type { SubscriberSummaryDto } from '@bcis/contracts';
import { Search, X } from 'lucide-react';
import { useEffect, useState } from 'react';

export function SubscriberQuickSearch({
  canSearch,
  onSelect,
}: {
  canSearch: boolean;
  onSelect: (subscriberId: string) => void;
}): React.JSX.Element | null {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SubscriberSummaryDto[]>([]);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [searched, setSearched] = useState(false);

  useEffect(() => {
    let current = true;
    const normalized = query.trim();
    setActiveIndex(-1);
    setError('');
    if (normalized.length < 2) {
      setResults([]);
      setSearched(false);
      setLoading(false);
      return;
    }
    setLoading(true);
    const timer = window.setTimeout(() => {
      void window.bcis?.masterData
        .listSubscribers({ q: normalized, page: 1, pageSize: 8 })
        .then((result) => {
          if (current) {
            setResults(result.items);
            setSearched(true);
          }
        })
        .catch((caught: unknown) => {
          if (current)
            setError(
              caught instanceof Error
                ? caught.message
                : 'Could not search subscribers.',
            );
        })
        .finally(() => {
          if (current) setLoading(false);
        });
    }, 250);
    return () => {
      current = false;
      window.clearTimeout(timer);
    };
  }, [query]);

  if (!canSearch) return null;

  const choose = (subscriber: SubscriberSummaryDto) => {
    onSelect(subscriber.id);
    setQuery('');
    setResults([]);
    setSearched(false);
  };

  return (
    <div className="subscriber-quick-search">
      <label className="quick-search-input">
        <Search aria-hidden="true" size={17} />
        <span className="sr-only">Search subscribers</span>
        <input
          aria-activedescendant={
            activeIndex >= 0 ? `subscriber-result-${activeIndex}` : undefined
          }
          aria-autocomplete="list"
          aria-controls="subscriber-search-results"
          aria-expanded={
            query.trim().length >= 2 &&
            (loading || results.length > 0 || searched)
          }
          autoComplete="off"
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown' && results.length) {
              event.preventDefault();
              setActiveIndex((index) => (index + 1) % results.length);
            } else if (event.key === 'ArrowUp' && results.length) {
              event.preventDefault();
              setActiveIndex((index) =>
                index <= 0 ? results.length - 1 : index - 1,
              );
            } else if (event.key === 'Enter' && activeIndex >= 0) {
              event.preventDefault();
              const selected = results[activeIndex];
              if (selected) choose(selected);
            } else if (event.key === 'Escape') {
              setQuery('');
              setResults([]);
              setSearched(false);
            }
          }}
          placeholder="Search subscribers"
          role="searchbox"
          value={query}
        />
        {query ? (
          <button
            aria-label="Clear subscriber search"
            className="quick-search-clear"
            onClick={() => setQuery('')}
            type="button"
          >
            <X aria-hidden="true" size={15} />
          </button>
        ) : null}
      </label>
      {query.trim().length >= 2 ? (
        <div className="quick-search-popover" id="subscriber-search-results">
          {loading ? (
            <div className="quick-search-state" role="status">
              Searching subscribers…
            </div>
          ) : null}
          {error ? (
            <div className="quick-search-error" role="alert">
              {error}
            </div>
          ) : null}
          {!loading && !error && searched && results.length === 0 ? (
            <div className="quick-search-state">No matching subscribers.</div>
          ) : null}
          {results.length ? (
            <>
              <div className="sr-only" role="status" aria-live="polite">
                {results.length} subscriber results
              </div>
              <ul role="listbox" aria-label="Subscriber search results">
                {results.map((subscriber, index) => (
                  <li key={subscriber.id}>
                    <button
                      aria-selected={index === activeIndex}
                      className="quick-search-result"
                      id={`subscriber-result-${index}`}
                      onClick={() => choose(subscriber)}
                      onMouseEnter={() => setActiveIndex(index)}
                      onMouseDown={(event) => event.preventDefault()}
                      role="option"
                      type="button"
                    >
                      <span>
                        <strong>{subscriber.fullName}</strong>
                        <small>
                          {subscriber.accountNumber} ·{' '}
                          {subscriber.primaryContact ?? 'No contact'}
                        </small>
                      </span>
                      <span className="record-status">{subscriber.status}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
