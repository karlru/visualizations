/**
 * Metric rows shared by the metrics panel and any story controller that feeds
 * it. Metrics are low-frequency strings, never per-frame drawing data.
 */
export interface MetricItem {
  readonly id: string;
  readonly label: string;
  readonly value: string;
}
