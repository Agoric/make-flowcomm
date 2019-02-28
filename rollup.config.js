export default [
  {
    input: 'src/index.js',
    output: [
      {
        file: 'dist/make-flowcomm.umd.js',
        format: 'umd',
        name: 'MakeFlowComm',
        globals: {
          '@agoric/harden': 'harden',
        },
      },
      {
        file: 'dist/make-flowcomm.esm.js',
        format: 'esm',
      },
      {
        file: 'dist/make-flowcomm.cjs.js',
        format: 'cjs',
      },
    ],
    external: ['@agoric/harden'],
  },
];
