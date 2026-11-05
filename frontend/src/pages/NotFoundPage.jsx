import Button from '../components/common/Button';
import usePageMeta from '../hooks/usePageMeta';

export default function NotFoundPage() {
  usePageMeta('Page not found', 'This page could not be found.', true);
  return (
    <main className="not-found" id="main-content">
      <span className="eyebrow">404 · A LITTLE OFF TRACK</span>
      <h1>Let’s get you back.</h1>
      <p>The page you’re looking for isn’t here.</p>
      <Button to="/">Back to home</Button>
    </main>
  );
}
