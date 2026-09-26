import { Component } from 'react';

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error) {
    console.error(this.props.fallbackLabel || 'Error de vista', error);
  }

  render() {
    if (this.state.failed) {
      return (
        <div className="rounded-2xl bg-white p-6 text-primary-dark shadow-sm">
          <p className="font-semibold">No se pudo mostrar este panel.</p>
          <p className="mt-1 text-sm text-primary-dark/70">
            Usa el menú superior para ir a otra sección. Si el problema continúa, recarga la página.
          </p>
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
