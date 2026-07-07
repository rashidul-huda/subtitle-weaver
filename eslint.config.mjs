// ESLint 9+ flat configuration ignoring build folders
export default [
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "out/**",
      "build/**",
      "dist/**"
    ]
  }
];
