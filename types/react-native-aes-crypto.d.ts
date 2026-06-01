declare module 'react-native-aes-crypto' {
  const Aes: {
    pbkdf2(
      password: string,
      salt: string,
      cost: number,
      length: number,
      algorithm: string
    ): Promise<string>;
    encrypt(text: string, key: string, iv: string, algorithm: string): Promise<string>;
    decrypt(ciphertext: string, key: string, iv: string, algorithm: string): Promise<string>;
  };
  export default Aes;
}
