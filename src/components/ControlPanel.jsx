import {
  DISPLAY_MODE_OPTIONS,
  LAYOUT_MODE_OPTIONS,
  SIZE_MODE_OPTIONS,
  blankTilesPercentRange,
  imageSizeRangeWide,
} from "../functionality";

/** These numbers are exactly `--panel-text-size` / `--panel-image-size` (multipliers). */
export const textSizeRange = { min: 0.45, max: 5.3, step: 0.01, defaultValue: 1 };

/** @deprecated Use `imageSizeRangeWide` from `functionality.js` or the `imageSizeRange` prop on `ControlPanel`. */
export const imageSizeRange = imageSizeRangeWide;

/** Top control bar only: one tenth of slider step (finer drag); step is the same for wide/narrow ranges. */
export const imageSizeMainBarStep = imageSizeRangeWide.step / 10;

/** Rounds to wide/narrow shared step (0.01). Debug panel + any 0.01-grid use. */
export function roundImageSizeStep(n) {
  return Math.round(n / imageSizeRangeWide.step) * imageSizeRangeWide.step;
}

/** Rounds to `imageSizeMainBarStep` (0.001). Main image size slider only. */
export function roundImageSizeMainBarStep(n) {
  return Math.round(n / imageSizeMainBarStep) * imageSizeMainBarStep;
}

/**
 * Integer "tenths" index: 0.0–0.09 → 0, 0.1–0.19 → 1, …, 1.0–1.09 → 10, …, 2.9–2.99 → 29, 3.0 → 30.
 * Used when detecting 0.1-size bucket crossings (see `IMAGE_TENTH_CROSS_SHUFFLE` in `functionality.js`).
 */
export function imageSizeTenthIndex(rounded) {
  return Math.floor(rounded * 10 + 1e-4);
}

export { blankTilesPercentRange };

function DebugPanel({
  textSize,
  onTextSize,
  imageSize,
  onDebugImageSize,
  imageSizeRange,
  blankTilesPercent,
  blankTilesPercentMax,
  onBlankTilesPercent,
  displayMode,
  onDisplayMode,
  sizeMode,
  onSizeMode,
  layoutMode,
  onLayoutMode,
}) {
  return (
    <div className="debug-panel" role="region" aria-label="Debug panel">
      <div className="control control--order">
        <label className="control__label" htmlFor="control-display-order">
          Order
        </label>
        <select
          id="control-display-order"
          className="control__input control__select"
          value={displayMode}
          onChange={(e) => onDisplayMode(e.target.value)}
        >
          {DISPLAY_MODE_OPTIONS.map(({ value, label }) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>
      <div className="control control--size-mode">
        <label className="control__label" htmlFor="control-size-mode">
          Size mode
        </label>
        <select
          id="control-size-mode"
          className="control__input control__select"
          value={sizeMode}
          onChange={(e) => onSizeMode(e.target.value)}
        >
          {SIZE_MODE_OPTIONS.map(({ value, label }) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>
      <div className="control control--layout">
        <label className="control__label" htmlFor="control-layout">
          Layout
        </label>
        <select
          id="control-layout"
          className="control__input control__select"
          value={layoutMode}
          onChange={(e) => onLayoutMode(e.target.value)}
        >
          {LAYOUT_MODE_OPTIONS.map(({ value, label }) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>
      <div className="control">
        <label className="control__label" htmlFor="control-blank-tiles">
          Blank tiles ({blankTilesPercent}% of grid, max {blankTilesPercentMax.toFixed(0)}% at this image size)
        </label>
        <input
          id="control-blank-tiles"
          className="control__input"
          type="range"
          min={blankTilesPercentRange.min}
          max={blankTilesPercentMax}
          step={blankTilesPercentRange.step}
          value={blankTilesPercent}
          onChange={(e) => onBlankTilesPercent(Number(e.target.value))}
        />
      </div>
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
          onChange={(e) =>
            onDebugImageSize(roundImageSizeStep(Number(e.target.value)))
          }
        />
      </div>
    </div>
  );
}

/**
 * Top chrome: full-width image size bar (1–100) + debug panel.
 */
export function ControlPanel({
  textSize,
  onTextSize,
  imageSize,
  onImageSize,
  onDebugImageSize,
  blankTilesPercent,
  blankTilesPercentMax = blankTilesPercentRange.max,
  onBlankTilesPercent,
  displayMode,
  onDisplayMode,
  sizeMode,
  onSizeMode,
  layoutMode,
  onLayoutMode,
  onImageSizeGrabStart,
  onImageSizeGrabEnd,
  /** Active min/max/step for the image size sliders (wide vs narrow viewport). */
  imageSizeRange = imageSizeRangeWide,
  /** Lower debug strip (order, modes, blank tiles, text/image sliders). Top image size bar always visible. */
  showDebugPanel = false,
}) {
  return (
    <div className="top-chrome">
      <div className="control-bar">
        <div className="control-bar__slider-wrap">
          <input
            className="control-bar__input"
            type="range"
            aria-label="Image size"
            min={imageSizeRange.min}
            max={imageSizeRange.max}
            step={imageSizeMainBarStep}
            value={imageSize}
            onChange={(e) => onImageSize(Number(e.target.value))}
            onPointerDown={onImageSizeGrabStart}
            onPointerUp={onImageSizeGrabEnd}
            onPointerCancel={onImageSizeGrabEnd}
            onBlur={onImageSizeGrabEnd}
          />
        </div>
      </div>
      {showDebugPanel ? (
        <DebugPanel
          textSize={textSize}
          onTextSize={onTextSize}
          imageSize={imageSize}
          onDebugImageSize={onDebugImageSize}
          imageSizeRange={imageSizeRange}
          blankTilesPercent={blankTilesPercent}
          blankTilesPercentMax={blankTilesPercentMax}
          onBlankTilesPercent={onBlankTilesPercent}
          displayMode={displayMode}
          onDisplayMode={onDisplayMode}
          sizeMode={sizeMode}
          onSizeMode={onSizeMode}
          layoutMode={layoutMode}
          onLayoutMode={onLayoutMode}
        />
      ) : null}
    </div>
  );
}
