// cspell:words nocase

import { type Expression } from './types';
import micromatch from 'micromatch';
import path from 'node:path';

export const testExpression = (expression: Expression, fileName: string) => {
  if (path.isAbsolute(fileName)) {
    throw new Error('File name must be relative');
  }

  const name = expression[0];

  if (name === 'allof') {
    const nextExpressions = expression.slice(1) as Expression[];

    return nextExpressions.every((nextExpression) => {
      return testExpression(nextExpression, fileName);
    });
  }

  if (name === 'anyof') {
    const nextExpressions = expression.slice(1) as Expression[];

    return nextExpressions.some((nextExpression) => {
      return testExpression(nextExpression, fileName);
    });
  }

  if (name === 'dirname' || name === 'idirname') {
    return micromatch.isMatch(
      path.dirname(fileName),
      '**/' + expression[1] + '/**',
      {
        dot: true,
        nocase: name === 'idirname',
      },
    );
  }

  if (name === 'match' || name === 'imatch') {
    const pattern = expression[1];
    const subject =
      expression[2] === 'wholename' ? fileName : path.basename(fileName);

    return micromatch.isMatch(subject, pattern, {
      dot: true,
      nocase: name === 'imatch',
    });
  }

  if (name === 'not') {
    const subExpression = expression[1];

    return !testExpression(subExpression, fileName);
  }

  throw new Error('Unknown expression');
};
