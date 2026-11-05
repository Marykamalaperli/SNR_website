import { Component } from 'react';
import Button from './Button';

export default class AppErrorBoundary extends Component {
  state = { hasError: false };
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  render() {
    if (this.state.hasError) {
      return (
        <main id="main-content" className="not-found" role="alert">
          <h1>Let’s try that again.</h1>
          <p>We couldn’t open this page. Please reload to continue.</p>
          <Button href="/">Return home</Button>
        </main>
      );
    }
    return this.props.children;
  }
}
