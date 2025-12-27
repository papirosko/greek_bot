export class TimeUtils {
  /**
   * Milliseconds in one second.
   */
  static second = 1000;
  /**
   * Milliseconds in one minute.
   */
  static minute = TimeUtils.second * 60;
  /**
   * Milliseconds in one hour.
   */
  static hour = TimeUtils.minute * 60;
  /**
   * Milliseconds in one day.
   */
  static day = TimeUtils.hour * 24;

  /**
   * Returns the current unix time in seconds.
   * @returns Unix timestamp in seconds.
   */
  static nowSeconds() {
    return Math.floor(Date.now() / 1000);
  }
}
