import { CloudWatchClient, PutMetricDataCommand } from "@aws-sdk/client-cloudwatch";

const client = new CloudWatchClient({});

export type MetricDimensions = Record<string, string>;

const toDimensions = (dimensions: MetricDimensions) =>
  Object.entries(dimensions).map(([Name, Value]) => ({ Name, Value }));

export const putMetric = async (
  metricName: string,
  value: number,
  dimensions: MetricDimensions
) => {
  const command = new PutMetricDataCommand({
    Namespace: "GreekBot",
    MetricData: [
      {
        MetricName: metricName,
        Value: value,
        Unit: "Count",
        Dimensions: toDimensions(dimensions),
      },
    ],
  });
  await client.send(command);
};

export const safePutMetric = async (
  metricName: string,
  value: number,
  dimensions: MetricDimensions
) => {
  try {
    await putMetric(metricName, value, dimensions);
  } catch (error) {
    // Metrics should not break the bot.
    console.warn("metric_error", metricName, error);
  }
};
