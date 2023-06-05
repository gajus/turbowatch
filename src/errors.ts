import { CustomError } from 'ts-custom-error';

export class TurbowatchError extends CustomError {}

export class UnexpectedError extends TurbowatchError {}

export class AbortError extends TurbowatchError {}
