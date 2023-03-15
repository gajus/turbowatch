import { type Expression } from './types';
import micromatch from 'micromatch';
import path from 'node:path';

export const testExpression = (expression: Expression, fileName: string) => {
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

  if (name === 'dirname') {
    const patternInput = expression[1];

    if (patternInput.startsWith('/')) {
      throw new Error('dirname cannot start with /');
    }

    if (patternInput.endsWith('/')) {
      throw new Error('dirname cannot end with /');
    }

    const pattern = '/' + patternInput;

    const lastIndex = path.dirname(fileName).lastIndexOf(pattern);

    return lastIndex !== -1;
  }

  if (name === 'idirname') {
    const patternInput = expression[1];

    if (patternInput.startsWith('/')) {
      throw new Error('dirname cannot start with /');
    }

    if (patternInput.endsWith('/')) {
      throw new Error('dirname cannot end with /');
    }

    const pattern = '/' + patternInput.toLowerCase();

    const lastIndex = path.dirname(fileName.toLowerCase()).lastIndexOf(pattern);

    return lastIndex !== -1;
  }

  if (name === 'match') {
    const pattern = expression[1];
    const subject =
      expression[2] === 'basename' ? path.basename(fileName) : fileName;

    return micromatch.isMatch(subject, pattern, {
      dot: true,
    });
  }

  if (name === 'imatch') {
    const pattern = expression[1];
    const subject =
      expression[2] === 'basename' ? path.basename(fileName) : fileName;

    return micromatch.isMatch(subject.toLowerCase(), pattern.toLowerCase(), {
      dot: true,
    });
  }

  if (name === 'not') {
    const subExpression = expression[1];

    return !testExpression(subExpression, fileName);
  }

  throw new Error('Unknown expression');
};
