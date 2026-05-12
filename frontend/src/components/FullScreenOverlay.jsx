import { createPortal } from 'react-dom';
import PropTypes from 'prop-types';

const FullScreenOverlay = ({
  isOpen,
  children,
  className = '',
  backdropClassName = 'bg-black/30',
  onBackdropClick,
}) => {
  if (!isOpen) return null;

  return createPortal(
    <div
      className={`fixed inset-0 w-screen h-screen z-[9999] flex items-center justify-center ${backdropClassName} ${className}`}
      onClick={onBackdropClick}
    >
      {children}
    </div>,
    document.body
  );
};

FullScreenOverlay.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  children: PropTypes.node.isRequired,
  className: PropTypes.string,
  backdropClassName: PropTypes.string,
  onBackdropClick: PropTypes.func,
};

export default FullScreenOverlay;
