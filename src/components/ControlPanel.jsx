/** These numbers are exactly `--panel-text-size` / `--panel-image-size` (multipliers). */
export const textSizeRange = { min: 0.45, max: 3.3, step: 0.01, defaultValue: 1 };
export const imageSizeRange = { min: 0.05, max: 3, step: 0.01, defaultValue: 1 };

export function ControlPanel({ textSize, onTextSize, imageSize, onImageSize }) {
  return (
    <div className="control-panel" role="region" aria-label="Display controls">
      <div className="control">
        <label className="control__label" htmlFor="control-text-size">
          Text size ({textSize.toFixed(2)}×)
        </label>
        <input
          id="control-text-size"
          className="control__input"
          type="range"
          min={textSizeRange.min}
          max={textSizeRange.max}
          step={textSizeRange.step}
          value={textSize}
          onChange={(e) => onTextSize(Number(e.target.value))}
        />
      </div>
      <div className="control">
        <label className="control__label" htmlFor="control-image-size">
          Image size ({imageSize.toFixed(2)}×)
        </label>
        <input
          id="control-image-size"
          className="control__input"
          type="range"
          min={imageSizeRange.min}
          max={imageSizeRange.max}
          step={imageSizeRange.step}
          value={imageSize}
          onChange={(e) => onImageSize(Number(e.target.value))}
        />
      </div>
    </div>
  );
}
