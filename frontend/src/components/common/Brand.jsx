import { Link } from 'react-router-dom';

export default function Brand({ light = false }) {
  return (
    <Link className={`brand ${light ? 'brand-light' : ''}`} to="/" aria-label="SNR NEST home">
      <svg viewBox="0 0 40 40" aria-hidden="true">
        <rect width="40" height="40" rx="11" />
        <path d="m9 20 11-10 11 10M11 25l9 6 9-6M11 20l9 6 9-6" />
      </svg>
      <span>
        SNR <strong>NEST</strong>
        <small>A better workday.</small>
      </span>
    </Link>
  );
}
