import { useState } from 'react'

const Tooltip = ({children, content, width, top, placeholder, right, left}) => {
    const [isVisible, setIsVisible] = useState(false);

    const showTooltip = () => {
      setIsVisible(true);
    };
  
    const hideTooltip = () => {
      setIsVisible(false);
    };

    const currentContent = () => {
      if(content === ""){
        return placeholder
      } else {
        return content
      }
    }
    
    return (
      <div className="tooltip-container" style={{width: width} }>
        <div
          className="tooltip-trigger"
          onMouseEnter={showTooltip}
          onMouseLeave={hideTooltip}
          onMouseOver={showTooltip}
        >
          {children}
        </div>
        {isVisible && <div className="tooltip" style={{top: top, left: left, right: right}}>{currentContent()}</div>}
      </div>
    );
}

export default Tooltip