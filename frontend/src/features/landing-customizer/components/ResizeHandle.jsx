export default function ResizeHandle({ position, onMouseDown }) {
  const getPositionStyles = () => {
    const base = {
      position: 'absolute',
      width: '10px',
      height: '10px',
      backgroundColor: 'white',
      border: '2px solid #f97316',
      borderRadius: '2px',
      zIndex: 10,
    };

    switch (position) {
      case 'nw':
        return { ...base, top: '-5px', left: '-5px', cursor: 'nwse-resize' };
      case 'n':
        return { ...base, top: '-5px', left: '50%', transform: 'translateX(-50%)', cursor: 'ns-resize' };
      case 'ne':
        return { ...base, top: '-5px', right: '-5px', cursor: 'nesw-resize' };
      case 'e':
        return { ...base, top: '50%', right: '-5px', transform: 'translateY(-50%)', cursor: 'ew-resize' };
      case 'se':
        return { ...base, bottom: '-5px', right: '-5px', cursor: 'nwse-resize' };
      case 's':
        return { ...base, bottom: '-5px', left: '50%', transform: 'translateX(-50%)', cursor: 'ns-resize' };
      case 'sw':
        return { ...base, bottom: '-5px', left: '-5px', cursor: 'nesw-resize' };
      case 'w':
        return { ...base, top: '50%', left: '-5px', transform: 'translateY(-50%)', cursor: 'ew-resize' };
      default:
        return base;
    }
  };

  return (
    <div
      className="hover:bg-orange-400 transition-colors"
      style={getPositionStyles()}
      onMouseDown={onMouseDown}
    />
  );
}
