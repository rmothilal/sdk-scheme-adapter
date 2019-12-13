/**************************************************************************
 *  (C) Copyright ModusBox Inc. 2019 - All rights reserved.               *
 *                                                                        *
 *  This file is made available under the terms of the license agreement  *
 *  specified in the corresponding source code repository.                *
 *                                                                        *
 *  ORIGINAL AUTHOR:                                                      *
 *  Rajiv Mothilal - rajiv.mothilal@modusbox.com                          *
 **************************************************************************/

'use strict';

const EventSdk = require('@mojaloop/event-sdk');
const Util = require('@mojaloop/central-services-shared').Util;

/**
 * Creates a span and adds it to the request headers
 * @return {Function}
 */
const createTrace = handlerMap => async (ctx, next) => {
    const handlers = handlerMap[ctx.state.path.pattern];
    const id = handlers ? handlers[ctx.request.method.toLowerCase()].id : undefined;
    const enableTracing = handlers ? handlers[ctx.request.method.toLowerCase()].enableTracing : false;
    if (ctx.request && id && enableTracing === true) {
        const context = EventSdk.Tracer.extractContextFromHttpRequest(ctx.request);
        const spanName = 'sdk_'+id;
        let span;
        if (context) {
            span = EventSdk.Tracer.createChildSpanFromContext(spanName, context);
        } else {
            span = EventSdk.Tracer.createSpan(spanName);
        }
        ctx.request.span = span;
    }
    await next();
};

/**
 * Closes span in the request header
 * @return {Function}
 */
const finishTrace = () => async (ctx) => {
    const span = ctx.request.span;
    const response = ctx.request.response;
    if (span) {
        if (response instanceof Error) {
            let state;
            if (response.output.payload.errorInformation && response.output.payload.errorInformation.errorCode) {
                state = new EventSdk.EventStateMetadata(EventSdk.EventStatusType.failed, response.output.payload.errorInformation.errorCode, response.output.payload.errorInformation.errorDescription);
            } else {
                state = new EventSdk.EventStateMetadata(EventSdk.EventStatusType.failed, response.output.statusCode, response.message);
            }
            span.error(response, state);
            span.finish(response.message, state);
        } else {
            try {
                let request = span.injectContextToHttpRequest( { headers: ctx.request.response.headers } );
                ctx.set({
                    traceparent: request.headers.traceparent,
                    tracestate: request.headers.tracestate
                });
                span.finish();
            } catch (e) {
                throw e;
            }
        }
    }
};

module.exports = {
    createTrace,
    finishTrace
};
