"use strict";

var $             = require('elements'),
    zen           = require('elements/zen'),
    ready         = require('elements/domready'),
    trim          = require('mout/string/trim'),
    keys          = require('mout/object/keys'),
    modal         = require('../ui').modal,
    toastr        = require('../ui').toastr,
    request       = require('agent'),
    getAjaxSuffix = require('../utils/get-ajax-suffix'),
    parseAjaxURI  = require('../utils/get-ajax-url').parse,
    getAjaxURL    = require('../utils/get-ajax-url').global,

    flags         = require('../utils/flags-state');

require('./dropdown-edit');

ready(function() {
    var body       = $('body'),
        warningURL = parseAjaxURI(getAjaxURL('confirmdeletion') + getAjaxSuffix());

    // Handles Creating new Configurations
    body.delegate('click', '[data-g5-outline-create], [data-g5-outline-duplicate]', function(event, element) {
        if (event) { event.preventDefault(); }

        modal.open({
            content: 'Loading',
            method: 'post',
            overlayClickToClose: false,
            remote: parseAjaxURI(element.href() + getAjaxSuffix()),
            remoteLoaded: function(response, content) {
                if (!response.body.success) {
                    modal.enableCloseByOverlay();
                    return;
                }

                var title   = content.elements.content.find('[name="title"]'),
                    preset  = content.elements.content.find('[name="preset"]'),
                    confirm = content.elements.content.find('[data-g-outline-create-confirm]');

                title.on('keyup', function(event) {
                    var code = event.which;
                    if (code === 13) {
                        confirm.emit('click');
                    }
                });

                confirm.on('click', function() {
                    confirm.hideIndicator();
                    confirm.showIndicator();

                    var URI = parseAjaxURI(confirm.data('g-outline-create-confirm') + getAjaxSuffix()),
                        data = { title: title.value(), preset: preset.value() };

                    if (!data.title) { delete data.title; }
                    if (!data.preset) { delete data.preset; }

                    request('post', URI, data, function(error, response) {
                        confirm.hideIndicator();

                        if (!response.body.success) {
                            modal.open({
                                content: response.body.html || response.body,
                                afterOpen: function(container) {
                                    if (!response.body.html) { container.style({ width: '90%' }); }
                                }
                            });
                        } else {
                            var base = $('#configurations').find('ul').find('li'),
                                outline = zen('li').attribute('class', base.attribute('class'));

                            outline.after(base).html(response.body.outline);

                            toastr.success(response.body.html || 'Action successfully completed.', response.body.title || '');
                            modal.close();
                        }

                    });
                });

                setTimeout(function() {
                    title[0].focus();
                }, 5);
            }
        });
    });

    // Handles Configurations Duplicate / Remove
    body.delegate('click', '#configurations [data-g-config]', function(event, element) {
        var mode   = element.data('g-config'),
            href   = element.data('g-config-href'),
            encode = window.btoa(href),//.substr(-20, 20), // in case the strings gets too long
            method = (element.data('g-config-method') || 'post').toLowerCase();

        if (event && event.preventDefault) { event.preventDefault(); }

        if (mode == 'delete' && !flags.get('free:to:delete:' + encode, false)) {
            // confirm before proceeding
            flags.warning({
                url: warningURL,
                callback: function(response, content) {
                    var confirm = content.find('[data-g-delete-confirm]'),
                        cancel  = content.find('[data-g-delete-cancel]');

                    if (!confirm) { return; }

                    confirm.on('click', function(e) {
                        e.preventDefault();
                        if (this.attribute('disabled')) { return false; }

                        flags.get('free:to:delete:' + encode, true);
                        $([confirm, cancel]).attribute('disabled');
                        body.emit('click', { target: element });

                        modal.close();
                    });

                    cancel.on('click', function(e) {
                        e.preventDefault();
                        if (this.attribute('disabled')) { return false; }

                        $([confirm, cancel]).attribute('disabled');
                        flags.get('free:to:delete:' + encode, false);

                        modal.close();
                    });
                }
            });

            return false;
        }

        element.hideIndicator();
        element.showIndicator();

        request(method, parseAjaxURI(href + getAjaxSuffix()), {}, function(error, response) {
            if (!response.body.success) {
                modal.open({
                    content: response.body.html || response.body,
                    afterOpen: function(container) {
                        if (!response.body.html) { container.style({ width: '90%' }); }
                    }
                });
            } else {
                var confSelector   = $('#configuration-selector'),
                    currentOutline = confSelector.value(),
                    outlineDeleted = response.body.outline,
                    reload         = $('[href="' + getAjaxURL('configurations') + '"]');

                // if the current outline is the one that's been deleted,
                // fallback to default
                if (outlineDeleted && currentOutline == outlineDeleted) {
                    var ids = keys(confSelector.selectizeInstance.Options);
                    if (ids.length) {
                        reload.href(reload.href().replace('style=' + outlineDeleted, 'style=' + ids.shift()));
                    }
                }

                if (!reload) { window.location = window.location; }
                else {
                    body.emit('click', { target: reload });
                }

                toastr.success(response.body.html || 'Action successfully completed.', response.body.title || '');
                if (outlineDeleted) {
                    body.outlineDeleted = outlineDeleted;
                }
            }

            element.hideIndicator();
        });

    });

    // Handles Configurations Titles Rename
    var updateTitle     = function(title, original, wasCanceled) {
            this.style('text-overflow', 'ellipsis');
            if (wasCanceled || title == original) { return; }
            var element = this,
                href    = element.data('g-config-href'),
                method  = (element.data('g-config-method') || 'post').toLowerCase(),
                parent  = element.parent();

            parent.showIndicator();
            parent.find('[data-title-edit]').addClass('disabled');

            request(method, parseAjaxURI(href + getAjaxSuffix()), { title: trim(title) }, function(error, response) {
                if (!response.body.success) {
                    modal.open({
                        content: response.body.html || response.body,
                        afterOpen: function(container) {
                            if (!response.body.html) { container.style({ width: '90%' }); }
                        }
                    });

                    element.data('title-editable', original).text(original);
                } else {
                    element.data('title', title).data('tip', title);

                    // refresh ID label and actions buttons
                    var dummy   = zen('div').html(response.body.outline),
                        id      = dummy.find('h4 span:last-child'),
                        actions = dummy.find('.outline-actions');

                    element.parent('.card').find('h4 span:last-child').html(id.html());
                    element.parent('.card').find('.outline-actions').html(actions.html());
                }

                parent.hideIndicator();
                parent.find('[data-title-edit]').removeClass('disabled');
            });
        },

        attachEditables = function(editables) {
            if (!editables || !editables.length) { return; }
            editables.forEach(function(editable) {
                editable = $(editable);
                editable.confWasAttached = true;
                editable.on('title-edit-start', function() {
                    editable.style('text-overflow', 'inherit');
                });
                editable.on('title-edit-end', updateTitle);
            });
        };

    body.on('statechangeAfter', function(event, element) {
        var editables = $('#configurations [data-title-editable]');
        if (!editables) { return true; }

        editables = editables.filter(function(editable) {
            return (typeof $(editable).confWasAttached) === 'undefined';
        });

        attachEditables(editables);
    });

    attachEditables($('#configurations [data-title-editable]'));
});

module.exports = {};
