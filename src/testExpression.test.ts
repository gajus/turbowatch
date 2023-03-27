import { testExpression } from './testExpression';
import { expect, it } from 'vitest';

it('[allof] evaluates as true if all of the grouped expressions also evaluated as true (true)', () => {
  expect(
    testExpression(['allof', ['match', 'bar', 'basename']], 'foo/bar'),
  ).toBe(true);
});

it('[allof] evaluates as true if all of the grouped expressions also evaluated as true (false, true)', () => {
  expect(
    testExpression(
      ['allof', ['match', 'foo', 'basename'], ['match', 'bar', 'basename']],
      'foo/bar',
    ),
  ).toBe(false);
});

it('[allof] evaluates as true if all of the grouped expressions also evaluated as true (false)', () => {
  expect(
    testExpression(['allof', ['match', 'foo', 'basename']], 'foo/bar'),
  ).toBe(false);
});

it('[anyof] evaluates as true if any of the grouped expressions also evaluated as true (true)', () => {
  expect(
    testExpression(['anyof', ['match', 'bar', 'basename']], 'foo/bar'),
  ).toBe(true);
});

it('[anyof] evaluates as true if any of the grouped expressions also evaluated as true (false, true)', () => {
  expect(
    testExpression(
      ['anyof', ['match', 'foo', 'basename'], ['match', 'bar', 'basename']],
      'foo/bar',
    ),
  ).toBe(true);
});

it('[anyof] evaluates as true if any of the grouped expressions also evaluated as true (false)', () => {
  expect(
    testExpression(['anyof', ['match', 'foo', 'basename']], 'foo/bar'),
  ).toBe(false);
});

it('[dirname] dot directory in subject does not break the pattern', () => {
  expect(
    testExpression(['dirname', 'node_modules'], 'node_modules/.dist/foo.js'),
  ).toBe(true);
});

it('[dirname] evaluates as true if a given file has a matching parent directory (foo)', () => {
  expect(testExpression(['dirname', 'foo'], 'foo/bar')).toBe(true);
  expect(testExpression(['dirname', 'bar'], 'foo/bar/baz')).toBe(true);
  expect(testExpression(['dirname', 'bar/baz'], 'foo/bar/baz/qux')).toBe(true);
  expect(testExpression(['dirname', 'foo/bar'], 'foo/bar/baz/qux')).toBe(true);
});

it('[dirname] evaluates as false if a given file does not have a matching parent directory (bar)', () => {
  expect(testExpression(['dirname', 'bar'], 'foo/bar')).toBe(false);
  expect(testExpression(['dirname', '/bar'], 'foo/bar/baz')).toBe(false);
  expect(testExpression(['dirname', 'foo'], '.foo/bar')).toBe(false);
});

it('[idirname] evaluates as true if a given file has a matching parent directory (foo)', () => {
  expect(testExpression(['idirname', 'FOO'], 'foo/bar')).toBe(true);
});

it('[idirname] evaluates as false if a given file does not have a matching parent directory (bar)', () => {
  expect(testExpression(['idirname', 'BAR'], 'foo/bar')).toBe(false);
});

it('[match] matches basename (bar)', () => {
  expect(testExpression(['match', 'bar', 'basename'], 'foo/bar')).toBe(true);
});

it('[match] matches basename (b*r)', () => {
  expect(testExpression(['match', 'b*r', 'basename'], 'foo/bar')).toBe(true);
});

it('[match] does not match basename (bar)', () => {
  expect(testExpression(['match', 'foo', 'basename'], 'foo/bar')).toBe(false);
});

it('[match] matches basename (BAR) (case insensitive)', () => {
  expect(testExpression(['imatch', 'bar', 'basename'], 'foo/bar')).toBe(true);
});

it('[match] matches basename (B*R) (case insensitive)', () => {
  expect(testExpression(['imatch', 'b*r', 'basename'], 'foo/bar')).toBe(true);
});

it('[match] does not match basename (BAR) (case insensitive)', () => {
  expect(testExpression(['imatch', 'foo', 'basename'], 'foo/bar')).toBe(false);
});

it('[not] evaluates as true if the sub-expression evaluated as false, i.e. inverts the sub-expression (true -> false)', () => {
  expect(testExpression(['not', ['match', 'bar', 'basename']], 'foo/bar')).toBe(
    false,
  );
});

it('[not] evaluates as true if the sub-expression evaluated as false, i.e. inverts the sub-expression (false -> true)', () => {
  expect(testExpression(['not', ['match', 'foo', 'basename']], 'foo/bar')).toBe(
    true,
  );
});
