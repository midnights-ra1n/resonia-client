import SparkMD5 from "spark-md5";

export function generateSalt(length = 12): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let salt = "";
  for (let i = 0; i < length; i++) {
    salt += chars[Math.floor(Math.random() * chars.length)];
  }
  return salt;
}

export function generateToken(password: string, salt: string): string {
  return SparkMD5.hash(password + salt);
}
